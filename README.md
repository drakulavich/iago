<p align="center">🦜</p>

<h1 align="center">Iago</h1>

<p align="center">
  <a href="https://github.com/drakulavich/iago/actions/workflows/test.yml"><img src="https://github.com/drakulavich/iago/actions/workflows/test.yml/badge.svg" alt="Tests"></a>
  <a href="https://www.npmjs.com/package/@drakulavich/iago"><img src="https://img.shields.io/npm/v/@drakulavich/iago" alt="npm version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun" alt="Bun"></a>
</p>

<p align="center"><b>Greptile-style Mermaid diagrams for AI code reviews — but driven by your own agent.</b><br>Iago perches on top of a <code>/review</code> comment and squawks a visual summary of the change: sequence, flow, class, or entity-relation.</p>

<p align="center"><i>"Awk! Awk! Add a diagram!"</i></p>

- **Claude Code skill** — run `/iago` (or `/squawk`) in your terminal; it appends the diagram to your `/review` comment.
- **Codex / Copilot / Gemini** — the same `SKILL.md`, the same open standard.
- **Your agent draws it** — Iago uses the LLM you're already running. No extra API key, no SaaS reviewer.
- **Type auto-detected** — sequence, flow, class, or entity-relation, picked from the diff. Override anytime.

---

## Why?

Greptile and CodeRabbit auto-add Mermaid diagrams to every PR. Claude Code's and
Codex's `/review` are great, but they don't draw. Iago fills that gap — using the
agent you already run, without locking you into a SaaS reviewer.

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

Iago is a skill for your coding agent. Pick the install that fits your stack.

**Runtime requirements:** `bun` (runs the helper) and `gh` (authenticated, for the GitHub write).

### Option 1 — Node / Bun (recommended)

If you have Node ≥18 or Bun, this is the friendliest path — no `curl | bash`,
fully typed, with a `--dry-run` flag and a `doctor` subcommand. Auto-detects
Claude Code, Codex, Copilot, and Gemini:

```bash
bunx @drakulavich/iago install --force      # auto-detects your agents
npx  @drakulavich/iago install --force      # same, via npm
```

Re-run the same command to update. Other commands:

```bash
bunx @drakulavich/iago doctor                # show install paths and versions
bunx @drakulavich/iago install --target=both # install into all agent dirs
bunx @drakulavich/iago install --version=v0.2.0
bunx @drakulavich/iago uninstall --target=claude
```

### Option 2 — curl | bash

Installs the skill without the npm CLI (pure shell). Note: running Iago itself
needs `bun` + `gh` on your machine.

```bash
curl -fsSL https://raw.githubusercontent.com/drakulavich/iago/main/install.sh | bash -s -- --force
```

Re-run to update. Add `--uninstall` to remove. Run with `--help` for all flags.

### Option 3 — Claude Code (plugin)

Install from the iago marketplace:

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

### Option 4 — Codex CLI

```bash
git clone https://github.com/drakulavich/iago /tmp/iago-skill
cp -R /tmp/iago-skill/iago    ~/.agents/skills/iago
cp -R /tmp/iago-skill/squawk  ~/.agents/skills/squawk
rm -rf /tmp/iago-skill
```

Invoke with `$iago`, `$squawk`, or `/skills`. Same `SKILL.md` open standard,
no Codex-specific changes needed.

### Option 5 — Copilot CLI / Gemini CLI

Drop the two skill folders into `.github/skills/` (Copilot) or `.gemini/skills/`
(Gemini). Behavior is identical.

---

## Usage

In Claude Code / Codex:

```text
/iago                         # auto-detect PR + type, append to /review
/iago 230                     # explicit PR number
/iago 230 sequence            # explicit type override
/iago --mode=comment          # post as a new comment

/squawk                       # alias
```

Accepted types: `sequence`, `flow` (alias `flowchart`), `class`,
`er` (aliases `erd`, `entity`).

> Installed as a Claude Code **plugin** (Option 3)? The commands are namespaced:
> use `/iago:iago` and `/iago:squawk`. The bare `/iago` / `/squawk` above apply
> to the manual skill-copy and Codex installs.

---

## Hooking it to your `/review` skill

Best UX is: run `/review` first, then `/iago` in the same session. Iago finds
your `/review` comment by looking for the marker `<!-- review-skill -->` in its
body.

If your review skill doesn't emit that marker, Iago falls back to "most recent
comment by you starting with `## Review`".

---

## Repo layout

```
iago/
├── .claude-plugin/
│   ├── marketplace.json                # Claude Code marketplace manifest
│   └── plugin.json                     # Plugin manifest
├── iago/
│   ├── SKILL.md                        # Main skill
│   ├── scripts/post.ts                 # Posts / appends the diagram to the PR (bun)
│   ├── scripts/sanitize.ts             # Mermaid sequence-label sanitizer
│   ├── references/
│   │   ├── diagram-selection.md        # Rubric for picking the diagram type
│   │   └── mermaid-templates.md
│   └── examples/
│       ├── sequence.md
│       ├── flow.md
│       ├── class.md
│       └── er.md
├── squawk/
│   └── SKILL.md                        # Alias for iago
├── cli/                                # @drakulavich/iago installer (TypeScript / Bun)
└── install.sh                          # curl | bash installer
```

## Development

**Shell / install.sh:**

```bash
./scripts/test.sh                      # run bats suite (auto-installs bats if missing)
./scripts/test.sh -f "uninstall"      # filter by name
shellcheck install.sh
```

**TypeScript CLI (`@drakulavich/iago`):**

```bash
cd cli
bun install
bun test                               # cli + skill helper (post.ts / sanitize.ts) tests
bun run typecheck                      # tsc --noEmit
bun run dev install --target=claude --dry-run
```

CI runs both suites on Ubuntu and **macOS**. The macOS leg is critical: it
tests against macOS's stock bash 3.2 (catches portability regressions in
`install.sh`) and against macOS's BSD `tar` (catches differences from GNU tar
in the TS extractor). Tests are offline (no network) thanks to the
`IAGO_LOCAL_TARBALL` hook — honored by both `install.sh` and the TS CLI.

## License

Made with 🦜 squawks and zero SaaS lock-in, under the MIT License.
