# Iago Runtime Helper → TypeScript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the skill's bash + Python runtime helper (`append_diagram.sh`, `sanitize_mermaid.py`) with one tested TypeScript helper (`post.ts`, `sanitize.ts`) run by Bun, and bring the docs back in sync.

**Architecture:** The helper lives inside the copyable skill folder `iago/scripts/` and uses only Node built-ins (so Bun runs it with zero install). Tests live in `cli/tests/` and import the skill `.ts` directly, reusing the existing `cd cli && bun test` setup. The `gh` interaction is injected so the logic is unit-tested without network.

**Tech Stack:** TypeScript, Bun (`bun:test`, `bun run`), `gh` CLI at runtime.

**Conventions:** Work on branch `ts-runtime-helper` (already created; the design spec is committed there). All `bun` commands run from `cli/` (`cd cli && …`). TS imports use explicit `.ts` extensions (the repo enables `allowImportingTsExtensions`). The skill folder must stay dependency-free — never add `package.json`/`node_modules` under `iago/`.

---

## File Structure

```
iago/scripts/
├── sanitize.ts   # CREATE — pure ';'→',' fix in sequenceDiagram message labels
└── post.ts       # CREATE — gh-backed find/replace/post; CLI entry via import.meta.main
cli/tests/
├── sanitize.test.ts   # CREATE — imports ../../iago/scripts/sanitize.ts
└── post.test.ts       # CREATE — imports ../../iago/scripts/post.ts, mocks the gh runner
iago/SKILL.md          # MODIFY — invoke `bun run post.ts`; bun+gh deps
README.md              # MODIFY — layout, prereqs, curl wording, dev, version, demo line
.claude-plugin/plugin.json        # MODIFY — version 0.1.0 → 0.2.0
.claude-plugin/marketplace.json   # MODIFY — both versions 0.1.0 → 0.2.0
iago/scripts/append_diagram.sh    # DELETE
iago/scripts/sanitize_mermaid.py  # DELETE
```

---

### Task 1: `sanitize.ts`

**Files:**
- Create: `iago/scripts/sanitize.ts`
- Test: `cli/tests/sanitize.test.ts`

- [ ] **Step 1: Write the failing test** — `cli/tests/sanitize.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { sanitize } from "../../iago/scripts/sanitize.ts";

describe("sanitize", () => {
  test("replaces ; with , in sequenceDiagram message labels", () => {
    const src = "```mermaid\nsequenceDiagram\n  A->>B: do x; then y\n```";
    expect(sanitize(src)).toContain("A->>B: do x, then y");
  });

  test("handles all arrow kinds (-->>, -), --x, with activation)", () => {
    const src = "```mermaid\nsequenceDiagram\n  A-->>B: a; b\n  C-)D: c; d\n  E--xF: e; f\n  G->>+H: g; h\n```";
    const out = sanitize(src);
    expect(out).toContain("a, b");
    expect(out).toContain("c, d");
    expect(out).toContain("e, f");
    expect(out).toContain("g, h");
  });

  test("leaves ; outside mermaid fences untouched", () => {
    const src = "prose with; a semicolon\n```mermaid\nflowchart TD\n  A-->B\n```";
    expect(sanitize(src)).toContain("prose with; a semicolon");
  });

  test("leaves flowchart node labels untouched", () => {
    const src = "```mermaid\nflowchart TD\n  A[do; thing] --> B\n```";
    expect(sanitize(src)).toContain("A[do; thing]");
  });

  test("leaves a non-mermaid fence completely untouched", () => {
    const src = "```js\nconst x = 1; const y = 2;\n```";
    expect(sanitize(src)).toBe(src);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test sanitize`
Expected: FAIL — cannot resolve `../../iago/scripts/sanitize.ts` (module not found).

- [ ] **Step 3: Write `iago/scripts/sanitize.ts`**

```ts
// Replace ';' with ',' in sequenceDiagram message labels inside ```mermaid fences.
// GitHub's Mermaid treats ';' as a statement separator, so a stray ';' in a
// message label truncates the line. Scope: only inside ```mermaid blocks, only
// on `<participant><arrow><participant>: <text>` lines. Never touches
// flowchart/class/er bodies, notes, participants, or prose.

const FENCE = /(```mermaid\n)([\s\S]*?)(\n```)/g;
// Arrows: ->>, -->>, ->, -->, -), --), -x, --x, with optional +/- activation.
const MSG = /^(\s*[A-Za-z_]\w*\s*(?:->>?[+-]?|-->>?|--?\)|--?x)\s*[A-Za-z_]\w*\s*:)(.*)$/;

function rewriteBlock(body: string): string {
  return body
    .split("\n")
    .map((line) => {
      const m = MSG.exec(line);
      if (!m) return line;
      const head = m[1] ?? "";
      const rest = m[2] ?? "";
      return head + rest.replace(/;/g, ",");
    })
    .join("\n");
}

export function sanitize(src: string): string {
  return src.replace(
    FENCE,
    (_full, open: string, body: string, close: string) => open + rewriteBlock(body) + close,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test sanitize`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add iago/scripts/sanitize.ts cli/tests/sanitize.test.ts
git commit -m "feat(skill): port mermaid sanitizer to TypeScript"
```

---

### Task 2: `post.ts` pure helpers

**Files:**
- Create: `iago/scripts/post.ts` (types + `findReviewCommentId` + `replaceOrAppendBlock`)
- Test: `cli/tests/post.test.ts`

- [ ] **Step 1: Write the failing test** — `cli/tests/post.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  findReviewCommentId,
  replaceOrAppendBlock,
  type Comment,
} from "../../iago/scripts/post.ts";

function c(id: number, created_at: string, body: string, login = "me"): Comment {
  return { id, created_at, body, user: { login } };
}

describe("findReviewCommentId", () => {
  test("marker match wins over heading and picks newest marked", () => {
    const comments = [
      c(1, "2024-01-01T00:00:00Z", "## Review old", "me"),
      c(2, "2024-01-02T00:00:00Z", "diagram <!-- review-skill --> here", "bot"),
      c(3, "2024-01-03T00:00:00Z", "## Review newer by me", "me"),
    ];
    expect(findReviewCommentId(comments, "me")).toBe(2);
  });

  test("falls back to newest '## Review' by viewer when no marker", () => {
    const comments = [
      c(1, "2024-01-01T00:00:00Z", "## Review one", "me"),
      c(2, "2024-01-05T00:00:00Z", "## Review two", "me"),
      c(3, "2024-01-09T00:00:00Z", "## Review elsewhere", "other"),
    ];
    expect(findReviewCommentId(comments, "me")).toBe(2);
  });

  test("returns null when nothing matches", () => {
    expect(findReviewCommentId([c(1, "2024-01-01T00:00:00Z", "hi", "me")], "me")).toBeNull();
  });
});

describe("replaceOrAppendBlock", () => {
  const block = "<!-- iago:begin -->\nNEW\n<!-- iago:end -->";

  test("appends when there is no prior block", () => {
    const out = replaceOrAppendBlock("## Review\nbody", block);
    expect(out).toContain("## Review\nbody");
    expect(out).toContain("<!-- iago:begin -->\nNEW\n<!-- iago:end -->");
  });

  test("replaces a prior block and is idempotent", () => {
    const first = replaceOrAppendBlock("## Review", block);
    const second = replaceOrAppendBlock(first, block);
    expect(second).toBe(first);
    expect((second.match(/iago:begin/g) ?? []).length).toBe(1);
  });

  test("does not interpret $ in the block as a regex replacement token", () => {
    const dollar = "<!-- iago:begin -->\ncost is $1 per $&\n<!-- iago:end -->";
    const seeded = replaceOrAppendBlock("x", block);
    const out = replaceOrAppendBlock(seeded, dollar);
    expect(out).toContain("cost is $1 per $&");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test post`
Expected: FAIL — cannot resolve `../../iago/scripts/post.ts`.

- [ ] **Step 3: Write `iago/scripts/post.ts`** (types + pure helpers only for now):

```ts
// Idempotently append/replace an Iago Mermaid block inside the most recent
// /review comment on a GitHub PR, falling back to a new comment. Pure helpers
// here; orchestration + CLI entry are added below. Runtime: bun + gh.

export interface Comment {
  id: number;
  created_at: string;
  body: string;
  user: { login: string };
}

const MARKER = "<!-- review-skill -->";
const HEADING = /^\s*#{1,3}\s+Review\b/m;
const IAGO_BLOCK = /<!--\s*iago:begin\s*-->[\s\S]*?<!--\s*iago:end\s*-->/;

export function findReviewCommentId(comments: Comment[], viewer: string): number | null {
  const byDate = (a: Comment, b: Comment): number => a.created_at.localeCompare(b.created_at);

  const marked = comments.filter((x) => x.body.includes(MARKER)).sort(byDate);
  if (marked.length > 0) return marked[marked.length - 1]!.id;

  const headed = comments
    .filter((x) => x.user.login === viewer && HEADING.test(x.body))
    .sort(byDate);
  if (headed.length > 0) return headed[headed.length - 1]!.id;

  return null;
}

export function replaceOrAppendBlock(currentBody: string, block: string): string {
  const trimmed = block.trim();
  // Use a replacer function so '$' sequences in the block aren't treated as
  // regex replacement tokens.
  if (IAGO_BLOCK.test(currentBody)) return currentBody.replace(IAGO_BLOCK, () => trimmed);
  const sep = currentBody.endsWith("\n") ? "" : "\n";
  return currentBody + sep + "\n" + trimmed + "\n";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && bun test post`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add iago/scripts/post.ts cli/tests/post.test.ts
git commit -m "feat(skill): post.ts comment-finding and idempotent block replace"
```

---

### Task 3: `post.ts` orchestration + CLI entry

**Files:**
- Modify: `iago/scripts/post.ts` (add `GhRunner`, `post`, `main`, default runner, entry guard)
- Test: `cli/tests/post.test.ts` (add orchestration tests)

- [ ] **Step 1: Add the failing orchestration tests** — append to `cli/tests/post.test.ts`:

```ts
import { post } from "../../iago/scripts/post.ts";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function tmpFile(body: string): string {
  const p = join(tmpdir(), `iago-test-${process.pid}-${Math.abs(hash(body))}.md`);
  writeFileSync(p, body);
  return p;
}
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

describe("post", () => {
  test("mode=comment always posts a new comment", () => {
    const f = tmpFile("<!-- iago:begin -->\nx\n<!-- iago:end -->");
    const calls: string[][] = [];
    const gh = (args: string[]): string => {
      calls.push(args);
      return "https://gh/comment/1";
    };
    try {
      const url = post({ repo: "o/r", pr: "5", mode: "comment", diagramFile: f }, gh);
      expect(url).toBe("https://gh/comment/1");
      expect(calls[0]?.slice(0, 2)).toEqual(["pr", "comment"]);
    } finally {
      rmSync(f, { force: true });
    }
  });

  test("append with marker patches the matched comment", () => {
    const f = tmpFile("<!-- iago:begin -->\nDIAG\n<!-- iago:end -->");
    const gh = (args: string[]): string => {
      if (args[1] === "graphql") return "me\n";
      if (args.includes("--slurp")) {
        return JSON.stringify([
          [{ id: 7, created_at: "2024-01-01T00:00:00Z", body: "## Review <!-- review-skill -->", user: { login: "me" } }],
        ]);
      }
      if (args.includes("PATCH")) return JSON.stringify({ html_url: "https://gh/comment/7" });
      return "";
    };
    try {
      const url = post({ repo: "o/r", pr: "5", mode: "append", diagramFile: f }, gh);
      expect(url).toBe("https://gh/comment/7");
    } finally {
      rmSync(f, { force: true });
    }
  });

  test("append falls back to a new comment when no review comment found", () => {
    const f = tmpFile("<!-- iago:begin -->\nDIAG\n<!-- iago:end -->");
    const gh = (args: string[]): string => {
      if (args[1] === "graphql") return "me\n";
      if (args.includes("--slurp")) return JSON.stringify([[]]);
      if (args[0] === "pr" && args[1] === "comment") return "https://gh/comment/new";
      return "";
    };
    try {
      const url = post({ repo: "o/r", pr: "5", mode: "append", diagramFile: f }, gh);
      expect(url).toBe("https://gh/comment/new");
    } finally {
      rmSync(f, { force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && bun test post`
Expected: FAIL — `post` is not exported from `post.ts`.

- [ ] **Step 3: Append orchestration to `iago/scripts/post.ts`** (after the pure helpers):

```ts
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sanitize } from "./sanitize.ts";

export type GhRunner = (args: string[], input?: string) => string;

const defaultGh: GhRunner = (args, input) =>
  execFileSync("gh", args, input === undefined ? { encoding: "utf8" } : { encoding: "utf8", input });

export interface PostOpts {
  repo: string;
  pr: string;
  mode: "append" | "comment";
  diagramFile: string;
}

function ghJson<T>(gh: GhRunner, args: string[]): T {
  return JSON.parse(gh(args)) as T;
}

export function post(opts: PostOpts, gh: GhRunner = defaultGh): string {
  const [owner, name] = opts.repo.split("/");
  if (!owner || !name) throw new Error(`Invalid --repo (want OWNER/REPO): ${opts.repo}`);

  const block = sanitize(readFileSync(opts.diagramFile, "utf8"));

  const postNew = (): string => {
    const tmp = join(tmpdir(), `iago-${process.pid}-${Date.now()}.md`);
    writeFileSync(tmp, block);
    try {
      const out = gh(["pr", "comment", opts.pr, "--repo", opts.repo, "--body-file", tmp]).trim();
      return out.split("\n").pop() ?? out;
    } finally {
      rmSync(tmp, { force: true });
    }
  };

  if (opts.mode === "comment") return postNew();

  const viewer = gh(["api", "graphql", "-f", "query={viewer{login}}", "-q", ".data.viewer.login"]).trim();
  const pages = ghJson<Comment[][]>(gh, [
    "api", "--paginate", "--slurp",
    "-H", "Accept: application/vnd.github+json",
    `/repos/${owner}/${name}/issues/${opts.pr}/comments`,
  ]);
  const comments = pages.flat();

  const targetId = findReviewCommentId(comments, viewer);
  if (targetId === null) return postNew();

  const current = comments.find((x) => x.id === targetId)!.body;
  const newBody = replaceOrAppendBlock(current, block);
  const resp = ghJson<{ html_url: string }>(gh, [
    "api", "-X", "PATCH",
    "-H", "Accept: application/vnd.github+json",
    `/repos/${owner}/${name}/issues/comments/${targetId}`,
    "-f", `body=${newBody}`,
  ]);
  return resp.html_url;
}

export function main(argv: string[]): number {
  const opts: Partial<PostOpts> = { mode: "append" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "--repo":
        opts.repo = next();
        break;
      case "--pr":
        opts.pr = next();
        break;
      case "--mode": {
        const m = next();
        if (m !== "append" && m !== "comment") throw new Error(`--mode must be append|comment, got: ${m}`);
        opts.mode = m;
        break;
      }
      case "--diagram-file":
        opts.diagramFile = next();
        break;
      default:
        throw new Error(`Unknown arg: ${a}`);
    }
  }
  if (!opts.repo) throw new Error("Missing required arg: --repo");
  if (!opts.pr) throw new Error("Missing required arg: --pr");
  if (!opts.diagramFile) throw new Error("Missing required arg: --diagram-file");

  console.log(post(opts as PostOpts));
  return 0;
}

if (import.meta.main) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
}
```

Note: the `import` lines must sit at the top of the file (move them above the `Comment` interface from Task 2 when editing — ESM imports must precede other statements). Keep the pure helpers and these additions in one module.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd cli && bun test post && bun run typecheck`
Expected: all `post` tests PASS (9 total in the file); typecheck clean (it type-checks the imported skill `.ts` under strict settings).

- [ ] **Step 5: Commit**

```bash
git add iago/scripts/post.ts cli/tests/post.test.ts
git commit -m "feat(skill): post.ts gh orchestration + CLI entry (bun)"
```

---

### Task 4: Switch SKILL.md to Bun and remove the old scripts

**Files:**
- Modify: `iago/SKILL.md`
- Delete: `iago/scripts/append_diagram.sh`, `iago/scripts/sanitize_mermaid.py`

- [ ] **Step 1: Update the invocation block in `iago/SKILL.md`**

Replace this block:

```bash
   SKILL_DIR="${CLAUDE_SKILL_DIR:-${OPENCODE_SKILL_DIR:-$(dirname "$0")}}"
   bash "$SKILL_DIR/scripts/append_diagram.sh" \
     --repo "$REPO" \
     --pr "$PR" \
     --mode "$MODE" \
     --diagram-file "$DIAGRAM_FILE"
```

with:

```bash
   SKILL_DIR="${CLAUDE_SKILL_DIR:-${OPENCODE_SKILL_DIR:-$(dirname "$0")}}"
   bun run "$SKILL_DIR/scripts/post.ts" \
     --repo "$REPO" \
     --pr "$PR" \
     --mode "$MODE" \
     --diagram-file "$DIAGRAM_FILE"
```

- [ ] **Step 2: Update the prose around it in `iago/SKILL.md`**

Replace the sentence `The helper lives at \`scripts/append_diagram.sh\` in this skill's own directory.` with:
`The helper lives at \`scripts/post.ts\` in this skill's own directory (run with \`bun\`).`

Then find any "Required tools" / prerequisites mention in `SKILL.md` and ensure it reads **`bun` + `gh`** (remove `jq` and `python3` if listed). Run `grep -niE 'jq|python|append_diagram|sanitize_mermaid|bash ' iago/SKILL.md` and update every hit so none reference the removed tools/scripts (the invocation line is now `bun run`, not `bash`).

- [ ] **Step 3: Delete the old scripts**

```bash
git rm iago/scripts/append_diagram.sh iago/scripts/sanitize_mermaid.py
```

- [ ] **Step 4: Verify nothing else references the removed files**

Run:
```bash
grep -rniE 'append_diagram|sanitize_mermaid' . --include='*.md' --include='*.sh' --include='*.ts' --include='*.bats' --include='*.json' | grep -vE '/(docs/superpowers|\.git)/'
```
Expected: **no output**. If `install.sh`, `cli/src/*`, or `tests/*.bats` reference either removed file, update them (they should copy the whole `iago/` folder generically — fix any hardcoded filename). Confirm `tests/*.bats` still pass: `./scripts/test.sh`.

- [ ] **Step 5: Commit**

```bash
git add iago/SKILL.md iago/scripts/append_diagram.sh iago/scripts/sanitize_mermaid.py
git commit -m "refactor(skill): run post.ts via bun; remove shell+python helpers"
```

---

### Task 5: README + manifest accuracy pass

**Files:**
- Modify: `README.md`
- Modify: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`

- [ ] **Step 1: Repo layout — update the scripts lines in `README.md`**

Replace:

```
│   ├── SKILL.md                        # Main skill
│   ├── scripts/append_diagram.sh       # Posts / appends the diagram to the PR
```

with:

```
│   ├── SKILL.md                        # Main skill
│   ├── scripts/post.ts                 # Posts / appends the diagram to the PR (bun)
│   ├── scripts/sanitize.ts             # Mermaid sequence-label sanitizer
```

- [ ] **Step 2: Remove the demo-gif placeholder in `README.md`**

Delete this line (and the surrounding blank line if it leaves a double blank):

```
> _Demo GIF coming soon — will live here:_ `docs/demo.gif`
```

- [ ] **Step 3: Reword the `curl | bash` rationale in `README.md`**

Replace:

```
### Option 2 — curl | bash

For systems without Node/Bun. Same behavior, pure shell:
```

with:

```
### Option 2 — curl | bash

Installs the skill without the npm CLI (pure shell). Note: running Iago itself
needs `bun` + `gh` on your machine.
```

- [ ] **Step 4: Add a runtime-requirements note under the `## Install` heading in `README.md`**

Immediately after the line `Iago is a skill for your coding agent. Pick the install that fits your stack.` add:

```

**Runtime requirements:** `bun` (runs the helper) and `gh` (authenticated, for the GitHub write).
```

- [ ] **Step 5: Update the Development section in `README.md`**

Replace:

```
./scripts/test.sh                      # run bats suite (auto-installs bats if missing)
./scripts/test.sh -f "uninstall"      # filter by name
shellcheck install.sh iago/scripts/append_diagram.sh
```

with:

```
./scripts/test.sh                      # run bats suite (auto-installs bats if missing)
./scripts/test.sh -f "uninstall"      # filter by name
shellcheck install.sh
```

And replace the line:

```
bun test                               # tests, ~700ms
```

with:

```
bun test                               # cli + skill helper (post.ts / sanitize.ts) tests
```

- [ ] **Step 6: Update the `--version` example in `README.md`**

Replace `bunx @drakulavich/iago install --version=v0.1.1` with `bunx @drakulavich/iago install --version=v0.2.0`.

- [ ] **Step 7: Bump manifest versions**

In `.claude-plugin/plugin.json`: change `"version": "0.1.0"` → `"version": "0.2.0"`.

In `.claude-plugin/marketplace.json`: change **both** occurrences `"version": "0.1.0"` → `"version": "0.2.0"` (the `metadata.version` and the `plugins[0].version`).

- [ ] **Step 8: Verify no stale references remain**

Run:
```bash
python3 -c "import json;json.load(open('.claude-plugin/plugin.json'));json.load(open('.claude-plugin/marketplace.json'));print('json ok')"
grep -niE 'append_diagram|sanitize_mermaid|demo\.gif|without Node/Bun|0\.1\.0' README.md .claude-plugin/*.json || echo "README/manifests clean"
```
Expected: `json ok`, then `README/manifests clean` (no matches).

- [ ] **Step 9: Commit**

```bash
git add README.md .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "docs: sync README + manifests with the TS helper; bump to 0.2.0"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Skill helper + cli tests**

Run: `cd cli && bun test`
Expected: all pass — the existing cli tests plus the new `sanitize` (5) and `post` (9) tests.

- [ ] **Step 2: Typecheck**

Run: `cd cli && bun run typecheck`
Expected: clean (strict; covers the imported skill `.ts`).

- [ ] **Step 3: Bats suite still green**

Run: `./scripts/test.sh`
Expected: all bats tests pass (install + manifest).

- [ ] **Step 4: Manual sanity of the helper entry**

Run: `bun run iago/scripts/post.ts --repo o/r --pr 1` (missing `--diagram-file`)
Expected: prints `Missing required arg: --diagram-file` and exits non-zero (2). Then:
Run: `bun run iago/scripts/post.ts --bogus`
Expected: prints `Unknown arg: --bogus`, exit 2.

- [ ] **Step 5: Final residue grep across the repo**

Run:
```bash
grep -rniE 'append_diagram|sanitize_mermaid' . --include='*.md' --include='*.ts' --include='*.sh' --include='*.bats' --include='*.json' | grep -vE '/(docs/superpowers|\.git)/' || echo "no residue"
```
Expected: `no residue` (the only allowed mentions are in the design spec / this plan under `docs/superpowers/`).

- [ ] **Step 6: Commit any verification fixups** (only if Steps 1–5 required changes)

```bash
git add -A
git commit -m "test: fixups from full verification of the TS helper"
```

---

## Self-Review

**Spec coverage:**
- `sanitize.ts` port + scope (mermaid fences, sequence labels only) → Task 1. ✔
- `post.ts` pure helpers (`findReviewCommentId`, `replaceOrAppendBlock`) → Task 2. ✔
- `post.ts` orchestration, injected `GhRunner`, `--paginate --slurp` + `.flat()`, PATCH/new-comment, arg parsing, `import.meta.main` entry → Task 3. ✔
- Tests in `cli/tests/`, mocked gh, idempotency, `$`-safety, fallbacks → Tasks 1–3. ✔
- SKILL.md → `bun run post.ts`; bun+gh deps; drop jq/python3 → Task 4. ✔
- Remove `append_diagram.sh` + `sanitize_mermaid.py` → Task 4. ✔
- README layout/prereqs/curl-wording/dev/version/demo-gif → Task 5. ✔
- Version drift `0.1.0`→`0.2.0` in both manifests → Task 5. ✔
- Verification gates (bun test, typecheck, bats, residue grep) → Task 6. ✔
- Skill folder stays dependency-free (Node built-ins only, no package.json under `iago/`) → enforced by design; Task 3 imports only `node:*` + `./sanitize.ts`. ✔

**Placeholder scan:** no TBD/TODO; every code step has complete code; commands have expected output. The only conditional step (Task 6 Step 6) is explicitly gated on prior steps finding issues. ✔

**Type/name consistency:** `Comment`, `GhRunner`, `PostOpts`, `findReviewCommentId`, `replaceOrAppendBlock`, `post`, `main`, `sanitize` are used identically across tasks and tests. Import paths use `../../iago/scripts/{sanitize,post}.ts` consistently. `--mode` values `append|comment` consistent. ✔
