# iago

> _"Awk! Awk! Add a diagram!"_

An Agent Skill that appends a **Mermaid diagram** (sequence, flow,
class, or entity-relation) to a GitHub pull request's `/review`
comment — exactly like Greptile does, but driven by your own AI coding
agent.

Named after [Iago the parrot from Aladdin](https://disney.fandom.com/wiki/Iago)
because the skill's job is to perch on top of a review comment and
loudly squawk a visual summary.

It auto-picks the diagram type from the diff (with a manual override),
posts to the PR using `gh`, and replaces any prior diagram block in
place so re-running stays idempotent.

Works in **Claude Code**, **Codex CLI**, and any other agent that
implements the open `SKILL.md` standard.

## Two skills, one job

This repo ships **two skills** that do the same thing:

- **`iago`** — the real skill, with all logic, rubric, and helper script.
- **`squawk`** — a thin alias that delegates to `iago`. Exists so
  `/squawk` shows up in the slash-command menu alongside `/iago`.

Install both, invoke whichever feels right.

---

## What it does

- Runs after your `/review` skill (or on demand).
- Reads the PR diff via `gh pr diff`.
- Picks one of `sequence`, `flow`, `class`, `er` based on the changes —
  see [`iago/references/diagram-selection.md`](iago/references/diagram-selection.md).
- Builds a single Mermaid block using real names from the diff.
- **Appends** it to the existing `/review` comment (default), or posts
  it as a standalone comment with `--mode=comment`.
- On re-run, replaces the previous diagram block in place — no
  duplicates.

GitHub renders ` ```mermaid ` blocks natively, so no extra service is
needed.

## Usage

```text
/iago                         # auto-detect PR + type, append to /review
/iago 230                     # explicit PR number
/iago 230 sequence            # explicit type override
/iago --mode=comment          # post as a new comment instead of appending

/squawk                       # same thing, alias
/squawk 230 er
```

Accepted types: `sequence`, `flow` (alias `flowchart`), `class`,
`er` (aliases `erd`, `entity`, `entity-relation`).

## Requirements

- `gh` CLI, authenticated (`gh auth status`).
- `jq`.
- `python3` (used for safe in-place block replacement inside the
  comment body).
- Your `/review` skill should ideally embed the marker
  `<!-- review-skill -->` somewhere in its comment. If not, this skill
  falls back to "most recent comment by you that starts with
  `## Review`".

## Install

### Claude Code

Personal (all projects):

```bash
git clone https://github.com/drakulavich/iago /tmp/iago-skill
mkdir -p ~/.claude/skills
cp -R /tmp/iago-skill/iago    ~/.claude/skills/iago
cp -R /tmp/iago-skill/squawk  ~/.claude/skills/squawk
rm -rf /tmp/iago-skill
```

Project-only — same idea but copy into `.claude/skills/` instead.

That's it. Claude Code picks up both `SKILL.md` files automatically.
Invoke with `/iago` or `/squawk`, or just say "squawk this PR" and
Claude will trigger it implicitly.

### Codex CLI

Personal:

```bash
git clone https://github.com/drakulavich/iago /tmp/iago-skill
mkdir -p ~/.agents/skills
cp -R /tmp/iago-skill/iago    ~/.agents/skills/iago
cp -R /tmp/iago-skill/squawk  ~/.agents/skills/squawk
rm -rf /tmp/iago-skill
```

Project-only — copy into `.agents/skills/` instead.

Invoke with `$iago`, `$squawk`, or via `/skills`. Same `SKILL.md` open
standard, no changes needed.

### Copilot CLI / Gemini CLI

Drop the two folders into `.github/skills/` (Copilot) or
`.gemini/skills/` (Gemini). Behavior is identical.

### Don't want the alias?

Just skip the `squawk/` copy step. `iago` works on its own.

## How auto-detection works

Priority order — first match wins:

| Signal | Type |
|---|---|
| Migrations / schema files / ORM models | `er` |
| ≥2 OO files with new classes / inheritance | `class` |
| Cross-component request flow (handler + client + worker) | `sequence` |
| Branching / state-machine logic in one component | `flow` |
| Trivial change (docs, deps, formatting) | **abstain** |

Full rubric and tie-breakers in
[`iago/references/diagram-selection.md`](iago/references/diagram-selection.md).
Templates for each type in
[`iago/references/mermaid-templates.md`](iago/references/mermaid-templates.md).

## Hook it into your /review skill

Easiest pattern: have your `/review` skill end with a step that invokes
this one. In your review skill's `SKILL.md`, add a final instruction:

```markdown
After posting the review comment, invoke the `iago` skill with the
same PR number so a Mermaid diagram is appended to the comment.
```

For idempotent appending to work cleanly, include this marker line in
the body of the comment your `/review` skill posts:

```markdown
<!-- review-skill -->
```

## Repo layout

```
iago/
├── README.md
├── LICENSE
├── iago/
│   ├── SKILL.md                       # main skill
│   ├── scripts/append_diagram.sh
│   ├── references/
│   │   ├── diagram-selection.md
│   │   └── mermaid-templates.md
│   └── examples/
│       ├── sequence.md
│       ├── flow.md
│       ├── class.md
│       └── er.md
└── squawk/
    └── SKILL.md                       # alias → delegates to iago
```

## License

MIT.
