# CLAUDE.md

Single source of truth for every coding agent (Claude Code, Codex, Cursor,
Aider, Copilot, Gemini, …) working on **or** with this repo. When this file and
any other doc disagree, **this file wins.**

## Project overview

Iago is a **skill** for AI coding agents that appends a **Mermaid diagram**
(sequence / flow / class / entity-relation) to a GitHub pull request's `/review`
comment. The host agent draws the diagram with the LLM it's already running;
Iago's helper posts it via `gh`. The diagram type is auto-detected from the diff
(overridable).

It is **skill-first**, distributed three ways:
- skill folders (`iago/`, `squawk/`) copied into an agent's skills dir,
- a Claude Code **plugin** (`.claude-plugin/`),
- a TypeScript **installer** CLI (`cli/`, published as `@drakulavich/iago`).

## Critical rules (read before changing anything)

- **No GitHub Action.** Iago used to ship a server-side Action with its own
  LLM-provider SDKs + a heuristic fallback. That was removed deliberately. Do
  **not** reintroduce an Action, an API-key/provider path, or a heuristic
  diagram generator — the diagram is always drawn by the host agent's LLM.
- **Runtime is bun + gh, nothing else.** The helper (`iago/scripts/post.ts`) is
  TypeScript run by `bun`; GitHub writes go through authenticated `gh`. The old
  `install.sh` (shell) and `sanitize_mermaid.py` (Python) were removed — don't
  bring shell/python back into the skill runtime.
- **The skill folder stays dependency-free.** `iago/scripts/*.ts` may import only
  Node built-ins (`node:*`) + each other. Never add a `package.json` or
  `node_modules` under `iago/` — the folder is copied verbatim into agent dirs.
- **Mermaid: never use reserved keywords as participant/node ids.** `loop`,
  `alt`, `opt`, `par`, `note`, `end`, `activate` (case-insensitive) break
  GitHub's renderer. (Incident: a `participant Loop` made `sequence.md` fail to
  render.) Likewise **never start an unquoted flowchart node label with `@`** —
  Mermaid lexes `[@` as edge-ID/shape syntax (incident: `N[@utils/utils -> …]`
  killed a posted diagram; `sanitize.ts` now auto-quotes these). Repo example
  diagrams are parse-validated by `cd cli && bun test`
  (`cli/tests/mermaid-validation.test.ts`); field rendering incidents go into
  `cli/tests/fixtures/mermaid/{valid,invalid}/` verbatim.
- **`post.ts` gh PATCH uses `-f` (raw-field), not `-F`.** `gh api -F/--field`
  treats a leading `@` as a file-read; comment bodies starting with `@mention`
  would break. `-f/--raw-field` is the safe static-string flag. Keep it.
- **Never commit local dev state.** `.omc/`, `.claude/`, `.codegraph/` are
  gitignored. **Do not `git add -A`** — stage files explicitly. (These dirs were
  once swept into a PR by `git add -A`.)
- **Versions stay aligned.** `cli/package.json`, `.claude-plugin/plugin.json`,
  and `.claude-plugin/marketplace.json` (both `version` fields) move together.
- **No eval suite.** Diagram quality is validated by dogfooding (run `/iago` on
  real PRs when the rubric changes), not a formal benchmark — a deterministic
  classifier no longer exists in skill-first, and an LLM-judge harness is
  overkill here. Don't rebuild `evals/`.

## Install & invoke

Runtime requirements: **`bun`** + authenticated **`gh`** (`gh auth status`).

```
# Claude Code (plugin):
/plugin marketplace add drakulavich/iago
/plugin install iago@iago-marketplace
/reload-plugins                                 # then invoke /iago:iago, /iago:squawk

# Any agent (recommended for Codex/Copilot/Gemini):
bunx @drakulavich/iago install --force          # npx also works; `doctor` shows paths

# Invoke:
/iago                  # auto-detect current PR + type, append to /review
/iago 230 sequence     # explicit PR + type (sequence|flow|class|er)
/iago --mode=comment   # standalone comment instead of appending
/squawk                # alias
```

Full install options (`curl`, `--target`, `--version`, `doctor`) and end-user
usage live in [README.md](./README.md) — this file keeps only the canonical path.

## Repo structure

```
iago/SKILL.md                     # the skill (agent instructions)
iago/scripts/post.ts              # find/replace/post the diagram comment (bun + gh)
iago/scripts/sanitize.ts          # Mermaid sequence-label ';'->',' sanitizer
iago/references/diagram-selection.md   # rubric: which diagram type for a diff
iago/references/mermaid-templates.md   # per-type Mermaid templates
iago/examples/{sequence,flow,class,er}.md   # rendered example per type
squawk/SKILL.md                   # /squawk alias
.claude-plugin/{plugin,marketplace}.json    # Claude plugin manifests
cli/                              # @drakulavich/iago installer (TypeScript / Bun)
docs/superpowers/                 # design specs + plans (historical record)
```

## How the skill executes

1. `iago/SKILL.md` tells the agent to pick a diagram type (per the selection
   rubric) and write the Mermaid (per the templates).
2. The agent writes the wrapped block (`<!-- iago:begin -->` … `<!-- iago:end -->`)
   to a temp file and runs:
   `bun run "$SKILL_DIR/scripts/post.ts" --repo OWNER/REPO --pr N --mode append --diagram-file FILE`.
3. `post.ts` finds the `/review` comment (marker `<!-- review-skill -->`, else the
   newest comment by the viewer starting with `# Review`, `## Review`, or
   `### Review`), sanitizes, idempotently
   replaces any prior Iago block (or appends), and posts via `gh`.

## Build / test

```
cd cli && bun install
cd cli && bun test            # cli + skill helper (post.ts / sanitize.ts) tests
cd cli && bun run typecheck    # tsc --noEmit (strict)
claude plugin validate . --strict   # plugin / marketplace manifests
```

No bats suite — manifest invariants are enforced by the CI `validate` job (below).

## CI / release

- `.github/workflows/test.yml` — jobs: **cli** (`bun test` + `typecheck` on
  Ubuntu + macOS; macOS catches BSD-`tar` extractor differences) and
  **validate** (`claude plugin validate --strict` + manifest jq invariants).
- `.github/workflows/publish.yml` — on a `vX.Y.Z` tag (matching
  `cli/package.json`), publishes the CLI to npm with provenance.

## Code style

- TypeScript is strict: `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
  `exactOptionalPropertyTypes`. Honor them (e.g. `?? ""` over non-null where
  reasonable; `import type` for type-only imports).
- Tests assert observable behavior, not internals; inject seams (e.g. the `gh`
  runner in `post.ts`) so logic is unit-testable without network.
- Commits: conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`). Branch
  for changes; PR into `main` (the default branch is protected from direct
  pushes).
