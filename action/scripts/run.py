#!/usr/bin/env python3
"""Iago Action entrypoint.

Reads PR diff, picks a diagram type, generates a Mermaid block (via LLM if
available, otherwise heuristic), and either appends it to the existing
/review comment or posts a new one.

All inputs come from environment variables wired up by action.yml.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
import textwrap
from pathlib import Path
from typing import Optional


# ---------- helpers ----------------------------------------------------------

def gh_api(args: list[str], *, method: str = "GET", input_data: Optional[str] = None) -> str:
    """Call `gh api` and return stdout."""
    cmd = ["gh", "api", "-X", method, *args]
    res = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        input=input_data,
        check=False,
    )
    if res.returncode != 0:
        raise RuntimeError(f"gh api failed: {' '.join(shlex.quote(c) for c in cmd)}\n{res.stderr}")
    return res.stdout


def gh(*args: str) -> str:
    res = subprocess.run(["gh", *args], capture_output=True, text=True, check=False)
    if res.returncode != 0:
        raise RuntimeError(f"gh failed: gh {' '.join(args)}\n{res.stderr}")
    return res.stdout


def gh_output(name: str, value: str) -> None:
    out = os.environ.get("GITHUB_OUTPUT")
    if not out:
        return
    with open(out, "a", encoding="utf-8") as fh:
        # Multi-line outputs use a delimiter to avoid escaping issues.
        if "\n" in value:
            delim = "IAGO_EOF_" + os.urandom(6).hex()
            fh.write(f"{name}<<{delim}\n{value}\n{delim}\n")
        else:
            fh.write(f"{name}={value}\n")


# ---------- arg parsing ------------------------------------------------------

VALID_TYPES = {"sequence", "flow", "class", "er", "auto"}
TYPE_ALIASES = {
    "flowchart": "flow",
    "erd": "er",
    "entity": "er",
    "entity-relation": "er",
}


def parse_trigger_args(raw: str, *, default_type: str, default_mode: str) -> tuple[str, str]:
    """Parse the trigger comment's tail. Returns (type, mode)."""
    diagram_type = default_type
    mode = default_mode
    for tok in raw.split():
        tok = tok.strip()
        if not tok:
            continue
        if tok.startswith("--mode="):
            v = tok.split("=", 1)[1]
            if v in {"append", "comment"}:
                mode = v
            continue
        norm = TYPE_ALIASES.get(tok.lower(), tok.lower())
        if norm in VALID_TYPES:
            diagram_type = norm
            continue
        # Ignore unknown tokens (e.g. PR number — Action already knows it).
    return diagram_type, mode


# ---------- diff classification ---------------------------------------------

SCHEMA_HINTS = (
    re.compile(r"(^|/)(migrations?|migrate|db|prisma)/", re.I),
    re.compile(r"\.sql$", re.I),
    re.compile(r"schema\.(prisma|sql|rb)$", re.I),
    re.compile(r"/(models|entities)/", re.I),
)
SCHEMA_DIFF_HINTS = (
    re.compile(r"\bCREATE\s+TABLE\b", re.I),
    re.compile(r"\bALTER\s+TABLE\b", re.I),
    re.compile(r"\bADD\s+COLUMN\b", re.I),
    re.compile(r"\bFOREIGN\s+KEY\b", re.I),
    re.compile(r"@Entity\b"),
    re.compile(r"^\s*model\s+\w+\s*\{", re.M),
)
OO_FILE_RE = re.compile(r"\.(ts|tsx|js|jsx|java|kt|cs|swift|rb|py|rs)$")
OO_DIFF_HINTS = (
    re.compile(r"^\+\s*(class|interface|trait|protocol)\s+\w+", re.M),
    re.compile(r"\bextends\s+\w+"),
    re.compile(r"\bimplements\s+\w+"),
)
HANDLER_HINTS = (
    re.compile(r"@app\.(get|post|put|delete|patch|route)"),
    re.compile(r"app\.(get|post|put|delete|patch)\("),
    re.compile(r"router\.(get|post|put|delete|patch)\("),
    re.compile(r"\b(Controller|Handler|Route)\b"),
    re.compile(r"\b(produce|consume|publish|subscribe)\b", re.I),
    re.compile(r"\bgrpc\b", re.I),
)


def classify_diagram_type(files: list[dict], diff_text: str) -> Optional[str]:
    """Return one of sequence/flow/class/er, or None to abstain."""
    # Trivial change check.
    code_changes = sum(
        f.get("additions", 0) + f.get("deletions", 0)
        for f in files
        if not f.get("filename", "").endswith((".md", ".txt"))
        and "package-lock" not in f.get("filename", "")
        and "yarn.lock" not in f.get("filename", "")
    )
    if code_changes < 10:
        return None

    paths = [f.get("filename", "") for f in files]

    # 1. ER
    if any(rx.search(p) for p in paths for rx in SCHEMA_HINTS) or any(
        rx.search(diff_text) for rx in SCHEMA_DIFF_HINTS
    ):
        return "er"

    # 2. Class — needs ≥2 OO files with class-shaped diff
    oo_files = [p for p in paths if OO_FILE_RE.search(p)]
    class_signals = sum(1 for rx in OO_DIFF_HINTS if rx.search(diff_text))
    if len(oo_files) >= 2 and class_signals >= 1:
        # Differentiate from "just method body edits" — require a `+class|interface|trait|protocol`.
        if re.search(r"^\+\s*(class|interface|trait|protocol)\s+\w+", diff_text, re.M):
            return "class"

    # 3. Sequence — handler-ish signals + multiple components
    handler_hits = sum(1 for rx in HANDLER_HINTS if rx.search(diff_text))
    has_client = any("client" in p.lower() or "fetch" in p.lower() or "api" in p.lower() for p in paths)
    has_handler = any(re.search(r"(routes?|handlers?|controllers?|api)/", p, re.I) for p in paths)
    has_worker = any(re.search(r"(workers?|consumers?|jobs?|queue)", p, re.I) for p in paths)
    if handler_hits >= 1 and (int(has_client) + int(has_handler) + int(has_worker)) >= 2:
        return "sequence"

    # 4. Flow — default for non-trivial logic changes
    return "flow"


# ---------- LLM generation ---------------------------------------------------

PROMPT_TEMPLATE = """\
You are Iago, a code-review parrot. Generate ONE Mermaid diagram of type
`{dtype}` that visualizes the most important change in the pull request below.

Hard rules:
- Output ONLY the Mermaid source. No prose, no fences, no explanation.
- Use real names from the diff (functions, classes, services, tables) — never
  placeholders like ServiceA / Foo / Bar.
- Keep it under ~30 nodes / ~50 edges. Abstract by module if larger.
- For `sequence`: use `autonumber`, `->>` for sync, `-)` for async, `-->>` for return.
- For `flow`: prefer `flowchart TD`. `{{}}` decisions, `[]` steps, `[[ ]]` subroutines.
- For `class`: only classes touched by the diff plus direct collaborators; use `+`/`-` for visibility.
- For `er`: only tables/entities touched by migration plus FK neighbors. Cardinality: `||--o{{`, `}}o--o{{`, `||--||`.
- No HTML, no styles, no emoji in node labels.

PR title: {title}

PR body:
{body}

Files changed ({files_count}):
{files_list}

Unified diff (truncated to {max_chars} chars):
{diff}
"""


def generate_with_llm(
    *,
    provider: str,
    model: str,
    dtype: str,
    pr_title: str,
    pr_body: str,
    files: list[dict],
    diff_text: str,
) -> Optional[str]:
    """Return Mermaid source or None on failure."""
    max_chars = 60_000
    diff_excerpt = diff_text[:max_chars]
    files_list = "\n".join(
        f"- {f['filename']} (+{f.get('additions', 0)}/-{f.get('deletions', 0)})"
        for f in files[:50]
    )
    prompt = PROMPT_TEMPLATE.format(
        dtype=dtype,
        title=pr_title or "(no title)",
        body=(pr_body or "(no body)")[:2000],
        files_count=len(files),
        files_list=files_list,
        max_chars=max_chars,
        diff=diff_excerpt,
    )

    if provider == "anthropic":
        try:
            import anthropic  # type: ignore
        except ImportError:
            print("anthropic package missing; cannot use Anthropic provider.", file=sys.stderr)
            return None
        client = anthropic.Anthropic()
        msg = client.messages.create(
            model=model or "claude-sonnet-4-5",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
        return _extract_mermaid(text)

    if provider == "openai":
        try:
            from openai import OpenAI  # type: ignore
        except ImportError:
            print("openai package missing; cannot use OpenAI provider.", file=sys.stderr)
            return None
        client = OpenAI()
        resp = client.chat.completions.create(
            model=model or "gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
        )
        text = (resp.choices[0].message.content or "").strip()
        return _extract_mermaid(text)

    return None


def _extract_mermaid(text: str) -> str:
    """Strip accidental ```mermaid fences if the model added them."""
    m = re.search(r"```(?:mermaid)?\s*\n(.*?)\n```", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    return text.strip()


# ---------- heuristic fallback ----------------------------------------------

def heuristic_diagram(dtype: str, files: list[dict]) -> str:
    paths = [f["filename"] for f in files[:20]]
    if dtype == "er":
        # Pull table-like names from migration / model paths.
        names = []
        for p in paths:
            stem = Path(p).stem
            if stem and stem not in names and not stem.startswith("_"):
                names.append(stem.upper().replace("-", "_"))
        names = names[:6] or ["ENTITY_A", "ENTITY_B"]
        lines = ["erDiagram"]
        for i in range(len(names) - 1):
            lines.append(f"    {names[i]} ||--o{{ {names[i+1]} : relates")
        for n in names:
            lines.append(f"    {n} {{\n      uuid id PK\n    }}")
        return "\n".join(lines)

    if dtype == "class":
        classes = []
        for p in paths:
            stem = Path(p).stem
            if stem and stem[0:1].isalpha():
                pascal = "".join(part.capitalize() for part in re.split(r"[_\-.]", stem) if part)
                if pascal and pascal not in classes:
                    classes.append(pascal)
        classes = classes[:5] or ["Foo", "Bar"]
        lines = ["classDiagram"]
        for c in classes:
            lines.append(f"    class {c}")
        for i in range(len(classes) - 1):
            lines.append(f"    {classes[i]} --> {classes[i+1]}")
        return "\n".join(lines)

    if dtype == "sequence":
        actors = ["User", "App"]
        for p in paths:
            if "worker" in p.lower(): actors.append("Worker")
            if "queue" in p.lower(): actors.append("Queue")
            if "api" in p.lower() or "handler" in p.lower(): actors.append("API")
        actors = list(dict.fromkeys(actors))[:4]
        lines = ["sequenceDiagram", "    autonumber"]
        for a in actors:
            lines.append(f"    participant {a}")
        for i in range(len(actors) - 1):
            lines.append(f"    {actors[i]}->>{actors[i+1]}: call")
        return "\n".join(lines)

    # flow
    return textwrap.dedent("""\
        flowchart TD
            Start([change]) --> Step[code modified]
            Step --> Done([merged])
        """).strip()


# ---------- comment posting --------------------------------------------------

BEGIN = "<!-- iago:begin -->"
END = "<!-- iago:end -->"


def wrap_block(dtype: str, mermaid: str) -> str:
    return (
        f"{BEGIN}\n"
        f"### 🦜 Iago says — `{dtype}` diagram\n\n"
        f"_Auto-generated by [iago](https://github.com/drakulavich/iago). Edit or remove this block; it will be replaced on the next run._\n\n"
        f"```mermaid\n{mermaid}\n```\n"
        f"{END}"
    )


IAGO_BLOCK_RE = re.compile(rf"{re.escape(BEGIN)}.*?{re.escape(END)}", re.DOTALL)


def find_review_comment(repo: str, pr: int, marker: str) -> Optional[dict]:
    raw = gh_api(["--paginate", f"/repos/{repo}/issues/{pr}/comments"])
    # `--paginate` concatenates JSON arrays; we need to reparse each chunk.
    # Easiest: re-call without --paginate and rely on most-recent being on first page.
    raw = gh_api([f"/repos/{repo}/issues/{pr}/comments?per_page=100"])
    comments = json.loads(raw)
    # Prefer marker match (most recent).
    matches = [c for c in comments if marker and marker in (c.get("body") or "")]
    if matches:
        matches.sort(key=lambda c: c["created_at"])
        return matches[-1]
    # Fallback: most recent comment by current user starting with `## Review` or `# Review`.
    viewer = json.loads(gh_api(["/user"])).get("login")
    fallback = [
        c for c in comments
        if c.get("user", {}).get("login") == viewer
        and re.match(r"^\s*#{1,3}\s+Review\b", c.get("body") or "", re.M)
    ]
    if fallback:
        fallback.sort(key=lambda c: c["created_at"])
        return fallback[-1]
    return None


def upsert_diagram(repo: str, pr: int, mode: str, marker: str, block: str) -> str:
    """Returns the comment URL."""
    if mode == "comment":
        body_file = "/tmp/iago_body.md"
        Path(body_file).write_text(block, encoding="utf-8")
        out = gh("pr", "comment", str(pr), "--repo", repo, "--body-file", body_file)
        # gh prints the URL on the last line.
        return out.strip().splitlines()[-1]

    # mode == "append"
    target = find_review_comment(repo, pr, marker)
    if not target:
        print("No /review comment found; posting standalone comment instead.", file=sys.stderr)
        return upsert_diagram(repo, pr, "comment", marker, block)

    current = target.get("body") or ""
    if IAGO_BLOCK_RE.search(current):
        new_body = IAGO_BLOCK_RE.sub(block, current)
    else:
        sep = "" if current.endswith("\n") else "\n"
        new_body = current + sep + "\n" + block + "\n"

    payload = json.dumps({"body": new_body})
    resp = gh_api(
        [f"/repos/{repo}/issues/comments/{target['id']}"],
        method="PATCH",
        input_data=payload,
    )
    return json.loads(resp).get("html_url", "")


# ---------- main -------------------------------------------------------------

def resolve_provider(requested: str) -> str:
    if requested != "auto":
        return requested
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    return "none"


def main() -> int:
    repo = os.environ["REPO"]
    pr = int(os.environ["PR_NUMBER"])
    args_raw = os.environ.get("TRIGGER_ARGS", "")
    default_type = os.environ.get("IAGO_DIAGRAM_TYPE", "auto")
    default_mode = os.environ.get("IAGO_MODE", "append")
    review_marker = os.environ.get("IAGO_REVIEW_MARKER", "<!-- review-skill -->")
    requested_provider = os.environ.get("IAGO_LLM_PROVIDER", "auto")
    model = os.environ.get("IAGO_LLM_MODEL", "")

    diagram_type, mode = parse_trigger_args(args_raw, default_type=default_type, default_mode=default_mode)

    pr_data = json.loads(gh_api([f"/repos/{repo}/pulls/{pr}"]))
    pr_title = pr_data.get("title", "")
    pr_body = pr_data.get("body") or ""
    files = json.loads(gh_api([f"/repos/{repo}/pulls/{pr}/files?per_page=100"]))

    # Skip-diagram label check
    labels = {l["name"].lower() for l in pr_data.get("labels", [])}
    if labels & {"skip-diagram", "no-diagram"}:
        print("Skip label present; abstaining.")
        gh_output("diagram_type", "skipped")
        return 0

    diff_text = gh("pr", "diff", str(pr), "--repo", repo)

    if diagram_type == "auto":
        chosen = classify_diagram_type(files, diff_text)
        if chosen is None:
            print("Trivial change; abstaining.")
            gh_output("diagram_type", "skipped")
            return 0
        diagram_type = chosen
    print(f"Diagram type: {diagram_type}")

    provider = resolve_provider(requested_provider)
    print(f"LLM provider: {provider}")

    mermaid = None
    if provider in {"anthropic", "openai"}:
        try:
            mermaid = generate_with_llm(
                provider=provider,
                model=model,
                dtype=diagram_type,
                pr_title=pr_title,
                pr_body=pr_body,
                files=files,
                diff_text=diff_text,
            )
        except Exception as e:
            print(f"LLM generation failed: {e}", file=sys.stderr)
            mermaid = None

    if not mermaid:
        print("Falling back to heuristic generator.")
        mermaid = heuristic_diagram(diagram_type, files)

    block = wrap_block(diagram_type, mermaid)
    url = upsert_diagram(repo, pr, mode, review_marker, block)

    print(f"Posted: {url}")
    gh_output("comment_url", url)
    gh_output("diagram_type", diagram_type)
    return 0


if __name__ == "__main__":
    sys.exit(main())
