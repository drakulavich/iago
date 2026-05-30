<p align="center">🦜</p>

<h1 align="center">Iago</h1>

<p align="center">
  <a href="https://github.com/drakulavich/iago/actions/workflows/test.yml"><img src="https://github.com/drakulavich/iago/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
  <a href="https://github.com/drakulavich/iago/blob/main/BENCHMARKS.md"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fdrakulavich%2Fiago%2Fmain%2Fevals%2Fbadge.json" alt="selection accuracy"></a>
  <a href="https://www.npmjs.com/package/@drakulavich/iago"><img src="https://img.shields.io/npm/v/@drakulavich/iago" alt="npm version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun" alt="Bun"></a>
</p>

<p align="center"><b>Greptile-style Mermaid diagrams for AI code reviews — but driven by your own agent.</b><br>Iago perches on top of a <code>/review</code> comment and squawks a visual summary of the change: sequence, flow, class, or entity-relation.</p>

<p align="center"><i>"Awk! Awk! Add a diagram!"</i></p>

- **GitHub Action** — comment `/iago` on any PR; no CLI needed.
- **Claude Code skill** — run `/iago` in your terminal, aliased as `/squawk`.
- **Codex / Copilot / Gemini** — the same `SKILL.md`, the same open standard.
- **Offline-friendly** — a heuristic fallback draws a diagram with no API key.

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

### Option 2 — Quickest install (Node / Bun)

If you have Node ≥18 or Bun, this is the friendliest path — no `curl | bash`,
fully typed, with a `--dry-run` flag and a `doctor` subcommand:

```bash
bunx @drakulavich/iago install --force      # auto-detects Claude / Codex / Copilot / Gemini
npx  @drakulavich/iago install --force      # same, via npm
```

Re-run the same command to update. Other commands:

```bash
bunx @drakulavich/iago doctor                # show install paths and versions
bunx @drakulavich/iago install --target=both # install into all four agent dirs
bunx @drakulavich/iago install --version=v0.1.1
bunx @drakulavich/iago uninstall --target=claude
```

### Option 3 — Quickest install (curl | bash)

For systems without Node/Bun. Same behavior, pure shell:

```bash
curl -fsSL https://raw.githubusercontent.com/drakulavich/iago/main/install.sh | bash -s -- --force
```

Re-run to update. Add `--uninstall` to remove. Run with `--help` for all flags.

### Option 4 — Claude Code (plugin)

Install from the iago marketplace (works today):

```bash
/plugin marketplace add drakulavich/iago
/plugin install iago@iago-marketplace
/reload-plugins
```

Already added the marketplace before? Refresh it first so it picks up the
latest manifest: `/plugin marketplace update iago-marketplace`.

Plugin skills are namespaced by the plugin, so invoke them as:

```text
/iago:iago        # auto-detect PR + diagram type, append to /review
/iago:squawk      # the /squawk alias, same behavior
```

Confirm it loaded under `/plugin` → **Installed**, or check that `/iago:` shows
up in the skill list.

Once it's accepted into Anthropic's community marketplace, you'll be able to
install it from there instead:

```bash
/plugin marketplace add anthropics/claude-plugins-community
/plugin install iago@claude-community
```

**Prefer the bare `/iago` and `/squawk` names** (no plugin namespace)? Copy the
skill folders in directly instead of installing the plugin:

```bash
git clone https://github.com/drakulavich/iago /tmp/iago-skill
cp -R /tmp/iago-skill/iago    ~/.claude/skills/iago
cp -R /tmp/iago-skill/squawk  ~/.claude/skills/squawk
rm -rf /tmp/iago-skill
```

Invoke with `/iago` or `/squawk` in any session, or just say "squawk this PR".

### Option 5 — Codex CLI (skill)

```bash
git clone https://github.com/drakulavich/iago /tmp/iago-skill
cp -R /tmp/iago-skill/iago    ~/.agents/skills/iago
cp -R /tmp/iago-skill/squawk  ~/.agents/skills/squawk
rm -rf /tmp/iago-skill
```

Invoke with `$iago`, `$squawk`, or `/skills`. Same `SKILL.md` open standard,
no Codex-specific changes needed.

### Option 6 — Copilot CLI / Gemini CLI

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

> Installed as a Claude Code **plugin** (Option 4)? The commands are namespaced:
> use `/iago:iago` and `/iago:squawk`. The bare `/iago` / `/squawk` above apply
> to the manual skill-copy and Codex installs.

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

## Development

**Shell / install.sh:**

```bash
./scripts/test.sh                      # run bats suite (auto-installs bats if missing)
./scripts/test.sh -f "uninstall"      # filter by name
shellcheck install.sh iago/scripts/append_diagram.sh
```

**TypeScript CLI (`@drakulavich/iago`):**

```bash
cd cli
bun install
bun test                               # 41 tests, ~700ms
bun run typecheck                      # tsc --noEmit
bun run dev install --target=claude --dry-run
```

CI runs both suites on Ubuntu and **macOS**. The macOS leg is critical: it
tests against macOS's stock bash 3.2 (catches portability regressions in
`install.sh`) and against macOS's BSD `tar` (catches differences from GNU tar
in the TS extractor). Tests are offline (no network) thanks to the
`IAGO_LOCAL_TARBALL` hook — honored by both `install.sh` and the TS CLI.

## Benchmarks

Iago's diagram-type selection, abstention, and heuristic Mermaid validity are
benchmarked deterministically in CI. Full methodology: [`BENCHMARKS.md`](BENCHMARKS.md).

<!-- eval:results:start -->
**Selection accuracy:** 100% (7 cases)  
**Mermaid validity (heuristic):** 4/4 parse  

| Type | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| `sequence` | 100% | 100% | 100% | 1 |
| `flow` | 100% | 100% | 100% | 1 |
| `class` | 100% | 100% | 100% | 1 |
| `er` | 100% | 100% | 100% | 1 |
| `abstain` | 100% | 100% | 100% | 3 |
<!-- eval:results:end -->

## License

Made with 🦜 squawks and zero SaaS lock-in, under the MIT License.
