# pr-diagrams

A small Agent Skill that appends a **Mermaid diagram** (sequence, flow,
class, or entity-relation) to a GitHub pull request's `/review` comment —
exactly like Greptile does, but driven by your own AI coding agent.

It auto-picks the diagram type from the diff (with a manual override),
posts to the PR using `gh`, and replaces any prior diagram block in
place so re-running stays idempotent.

Works in **Claude Code**, **Codex CLI**, and any other agent that
implements the open `SKILL.md` standard.

---

## What it does

- Runs after your `/review` skill (or on demand).
- Reads the PR diff via `gh pr diff`.
- Picks one of `sequence`, `flow`, `class`, `er` based on the changes —
  see [`references/diagram-selection.md`](references/diagram-selection.md).
- Builds a single Mermaid block using real names from the diff.
- **Appends** it to the existing `/review` comment (default), or posts
  it as a standalone comment with `--mode=comment`.
- On re-run, replaces the previous diagram block in place — no
  duplicates.

GitHub renders ` ```mermaid ` blocks natively, so no extra service is
needed.

## Usage

```text
/pr-diagrams                    # auto-detect PR + type, append to /review
/pr-diagrams 230                # explicit PR number
/pr-diagrams 230 sequence       # explicit type override
/pr-diagrams --mode=comment     # post as a new comment instead of appending
```

Accepted types: `sequence`, `flow` (alias `flowchart`), `class`,
`er` (aliases `erd`, `entity`, `entity-relation`).

## Requirements

- `gh` CLI, authenticated (`gh auth status`).
- `jq`.
- `python3` (used for safe in-place block replacement inside the
  comment body).
- The `/review` skill should ideally embed the marker
  `<!-- review-skill -->` somewhere in its comment. If not, this skill
  falls back to "most recent comment by you that starts with `## Review`".

## Install

### Claude Code

Personal (all projects):

```bash
git clone https://github.com/<you>/pr-diagrams ~/.claude/skills/pr-diagrams
```

Project-only:

```bash
git clone https://github.com/<you>/pr-diagrams .claude/skills/pr-diagrams
```

That's it — Claude Code picks up `SKILL.md` automatically. Invoke with
`/pr-diagrams` or let Claude trigger it implicitly when you ask to
"add a diagram to the PR".

### Codex CLI

Personal:

```bash
git clone https://github.com/<you>/pr-diagrams ~/.agents/skills/pr-diagrams
```

Project-only:

```bash
git clone https://github.com/<you>/pr-diagrams .agents/skills/pr-diagrams
```

Then invoke with `$pr-diagrams` or via `/skills`. Codex uses the same
`SKILL.md` open standard, so no changes needed.

### Copilot CLI / Gemini CLI

The skill follows the open spec. Drop it in `.github/skills/pr-diagrams`
(Copilot) or `.gemini/skills/pr-diagrams` (Gemini) and it will be
discovered. Behavior is identical.

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
[`references/diagram-selection.md`](references/diagram-selection.md).
Templates for each type in
[`references/mermaid-templates.md`](references/mermaid-templates.md).

## Hook it into your /review skill

Easiest pattern: have your `/review` skill end with a step that invokes
this one. In your review skill's `SKILL.md`, add a final instruction:

```markdown
After posting the review comment, invoke the `pr-diagrams` skill with
the same PR number so a Mermaid diagram is appended to the comment.
```

For idempotent appending to work cleanly, include this marker line in
the body of the comment your `/review` skill posts:

```markdown
<!-- review-skill -->
```

The script uses that marker to find the right comment to edit. Without
it, the script falls back to "most recent comment by you starting with
`## Review`".

## Repo layout

```
pr-diagrams/
├── SKILL.md
├── README.md
├── LICENSE
├── scripts/
│   └── append_diagram.sh
├── references/
│   ├── diagram-selection.md
│   └── mermaid-templates.md
└── examples/
    ├── sequence.md
    ├── flow.md
    ├── class.md
    └── er.md
```

## License

MIT.
