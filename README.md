# 🦜 Iago

> _"Awk! Awk! Add a diagram!"_

**Greptile-style Mermaid diagrams for AI code reviews — but driven by your own
agent.** Iago perches on top of a `/review` comment and squawks a visual
summary of the change: sequence, flow, class, or entity-relation.

Works as:

- 🤖 **GitHub Action** — comment `/iago` on any PR (no CLI needed).
- 💻 **Claude Code skill** — `/iago` in your terminal.
- 🦦 **Codex CLI skill** — same skill, same standard.
- 🪞 Aliased as **`/squawk`** in all three.

> _Demo GIF coming soon — will live here:_ `docs/demo.gif`

---

## Why?

Greptile and CodeRabbit auto-add Mermaid diagrams to every PR. Claude Code's
and Codex's `/review` are great, but they don't draw. Iago fills that gap —
without locking you into a SaaS reviewer.

## How it picks the diagram type

Auto-detected from the diff (priority order — first match wins):

| Signal | Type |
|---|---|
| Migrations / `*.sql` / `schema.prisma` / ORM models | `er` |
| ≥2 OO files with new `class` / `interface` / `trait` | `class` |
| Cross-component request flow (handler + client + worker) | `sequence` |
| Branching / state-machine / non-trivial logic | `flow` |
| Trivial change (docs / deps / formatting) | **abstain** |

Override anytime: `/iago sequence`, `/iago er`, etc.

Full rubric: [`iago/references/diagram-selection.md`](iago/references/diagram-selection.md).

---

## Install

### Option 1 — GitHub Action (recommended for teams)

Drop this file into `.github/workflows/iago.yml`:

```yaml
name: Iago
on:
  issue_comment:
    types: [created]
permissions:
  pull-requests: write
  contents: read
jobs:
  iago:
    if: github.event.issue.pull_request && startsWith(github.event.comment.body, '/iago')
    runs-on: ubuntu-latest
    steps:
      - uses: drakulavich/iago@v0.1.0
        with:
          # Pick one to get LLM-quality diagrams (otherwise heuristic fallback is used):
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          # openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

Then on any PR, comment `/iago` (or `/iago sequence`, etc.) and Iago appends a
diagram to the most recent `/review` comment, or posts a new one.

Full example with all inputs: [`examples/workflow.yml`](examples/workflow.yml).

### Option 2 — Claude Code (skill)

Via the Claude Code marketplace:

```bash
/plugin marketplace add drakulavich/iago
/plugin install iago@iago-marketplace
```

Or manually:

```bash
git clone https://github.com/drakulavich/iago /tmp/iago-skill
cp -R /tmp/iago-skill/iago    ~/.claude/skills/iago
cp -R /tmp/iago-skill/squawk  ~/.claude/skills/squawk
rm -rf /tmp/iago-skill
```

Invoke with `/iago` or `/squawk` in any session, or just say "squawk this PR".

### Option 3 — Codex CLI (skill)

```bash
git clone https://github.com/drakulavich/iago /tmp/iago-skill
cp -R /tmp/iago-skill/iago    ~/.agents/skills/iago
cp -R /tmp/iago-skill/squawk  ~/.agents/skills/squawk
rm -rf /tmp/iago-skill
```

Invoke with `$iago`, `$squawk`, or `/skills`. Same `SKILL.md` open standard,
no Codex-specific changes needed.

### Option 4 — Copilot CLI / Gemini CLI

Drop the two skill folders into `.github/skills/` (Copilot) or `.gemini/skills/`
(Gemini). Behavior is identical.

---

## Usage

### In CLI (Claude Code / Codex)

```text
/iago                         # auto-detect PR + type, append to /review
/iago 230                     # explicit PR number
/iago 230 sequence            # explicit type override
/iago --mode=comment          # post as a new comment

/squawk                       # alias
```

Accepted types: `sequence`, `flow` (alias `flowchart`), `class`,
`er` (aliases `erd`, `entity`).

### In GitHub (Action)

Just comment on a PR:

```text
/iago
/iago er
/iago flow --mode=comment
```

Iago reacts 👀 → does its work → reacts 🚀 on success or 😕 on failure.

---

## Hooking it to your `/review` skill

Best UX is: run `/review` first, then `/iago`. Iago finds your `/review`
comment by looking for the marker `<!-- review-skill -->` in its body.

If your review skill doesn't emit that marker, Iago falls back to "most
recent comment by you starting with `## Review`".

If you want one command to do both, the cleanest path today is the Action +
having Codex/Claude post a `/review` first, then commenting `/iago`.

---

## Inputs (Action)

| Input | Default | Description |
|---|---|---|
| `github-token` | `${{ github.token }}` | Token with `pull-requests: write`. |
| `trigger` | `/iago` | Comment prefix that activates the Action. |
| `diagram-type` | `auto` | `auto` \| `sequence` \| `flow` \| `class` \| `er`. |
| `mode` | `append` | `append` to /review comment, or `comment` for standalone. |
| `llm-provider` | `auto` | `auto` \| `anthropic` \| `openai` \| `none`. |
| `anthropic-api-key` | _(none)_ | Anthropic API key. |
| `openai-api-key` | _(none)_ | OpenAI API key. |
| `llm-model` | _(provider default)_ | `claude-sonnet-4-5`, `gpt-4o-mini`, etc. |
| `review-comment-marker` | `<!-- review-skill -->` | Marker to find /review. |

## Outputs (Action)

| Output | Description |
|---|---|
| `comment-url` | URL of the comment that was edited or created. |
| `diagram-type` | Type generated, or `skipped` if Iago abstained. |

---

## Repo layout

```
iago/
├── action.yml                          # GitHub Action entrypoint
├── action/scripts/run.py               # Action implementation
├── .claude-plugin/
│   ├── marketplace.json                # Claude Code marketplace manifest
│   └── plugin.json                     # Plugin manifest
├── iago/
│   ├── SKILL.md                        # Main CLI skill
│   ├── scripts/append_diagram.sh
│   ├── references/
│   │   ├── diagram-selection.md
│   │   └── mermaid-templates.md
│   └── examples/
│       ├── sequence.md
│       ├── flow.md
│       ├── class.md
│       └── er.md
├── squawk/
│   └── SKILL.md                        # Alias for iago
└── examples/
    └── workflow.yml                    # Example GitHub Actions workflow
```

## License

MIT.
