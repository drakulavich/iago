# AGENTS.md — Iago

Machine-readable guide for AI coding agents. If you were handed this repo's URL,
this file tells you what Iago is and how to install, configure, and invoke it.

## What Iago is

Iago is a **skill** for AI coding agents (Claude Code, Codex, Copilot, Gemini).
It appends a **Mermaid diagram** (sequence / flow / class / entity-relation) to a
GitHub pull request's `/review` comment. Your agent draws the diagram with the
LLM it's already running; Iago's helper posts it to GitHub. No API key, no SaaS
reviewer — the diagram type is auto-detected from the diff (overridable).

## Runtime requirements

- **`bun`** — runs the post helper (`iago/scripts/post.ts`).
- **`gh`** — GitHub CLI, authenticated (`gh auth status`), token with
  `pull-requests: write`.

## Install (choose one)

**A. Claude Code — plugin (Claude only):**
```
/plugin marketplace add drakulavich/iago
/plugin install iago@iago-marketplace
```
Invoke namespaced: `/iago:iago`, `/iago:squawk`.

**B. Any agent — Node/Bun installer (recommended for Codex / Copilot / Gemini):**
```
bunx @drakulavich/iago install --force      # or: npx @drakulavich/iago install --force
```
Auto-detects which agents you have and installs into each. Useful subcommands:
```
bunx @drakulavich/iago doctor                # show exact install paths + versions
bunx @drakulavich/iago install --target=both # install into all detected agent dirs
bunx @drakulavich/iago uninstall --target=claude
```

**C. Manual copy:** copy the `iago/` and `squawk/` folders into your agent's
skills directory. Run `bunx @drakulavich/iago doctor` to see the exact path per
agent (e.g. Claude `~/.claude/skills/`, Codex `~/.agents/skills/`,
Gemini `~/.gemini/skills/`).

## Invoke

```
/iago                  # auto-detect the current PR + diagram type, append to /review
/iago 230              # explicit PR number
/iago 230 sequence     # explicit type: sequence | flow | class | er
/iago --mode=comment   # post a standalone comment instead of appending to /review
/squawk                # alias for /iago
```
Type aliases: `flow` = `flowchart`; `er` = `erd` / `entity`. Best result: run
`/review` first, then `/iago` in the same session.

## How it works (for an agent executing the skill)

1. Read `iago/SKILL.md` — it instructs you to pick a diagram type using the
   rubric in `iago/references/diagram-selection.md` and to write the Mermaid
   using `iago/references/mermaid-templates.md`.
2. Write the wrapped block (`<!-- iago:begin -->` … `<!-- iago:end -->`) to a
   temp file, then run:
   ```
   bun run "$SKILL_DIR/scripts/post.ts" --repo OWNER/REPO --pr N --mode append --diagram-file FILE
   ```
3. `post.ts` finds the `/review` comment (marker `<!-- review-skill -->`, else the
   newest comment by you starting with `## Review`), idempotently replaces any
   prior Iago block (or appends one), and posts via `gh`. `--mode=comment` posts
   a standalone comment instead.

## Key files

| Path | Purpose |
|---|---|
| `iago/SKILL.md` | The skill — agent instructions. |
| `squawk/SKILL.md` | `/squawk` alias of the skill. |
| `iago/references/diagram-selection.md` | Rubric for choosing the diagram type. |
| `iago/references/mermaid-templates.md` | Per-type Mermaid templates. |
| `iago/scripts/post.ts` | Runtime helper: find/replace/post the comment (bun). |
| `iago/scripts/sanitize.ts` | Mermaid sequence-label sanitizer. |
| `iago/examples/*.md` | Rendered example diagrams, one per type. |
| `.claude-plugin/` | Plugin + marketplace manifests. |
| `cli/` | `@drakulavich/iago` installer (TypeScript / Bun). |

## Develop / test

```
cd cli && bun test            # cli + skill-helper (post.ts / sanitize.ts) tests
cd cli && bun run typecheck    # tsc --noEmit
claude plugin validate . --strict   # plugin / marketplace manifests
```
