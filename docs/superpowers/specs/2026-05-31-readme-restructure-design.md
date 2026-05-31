# README restructure — human-optimized & lean

**Date:** 2026-05-31
**Status:** Approved (design); pending implementation plan

## Goal

Make the top-level `README.md` optimized for a **first-time human adopter**:
blocks ordered most-important → least-important, unnecessary detail removed, and
reference/contributor material relocated under `docs/`. Target ~212 → ~60–70
lines.

## New README outline (top = most important)

1. **Header** *(unchanged)* — centered 🦜 / `Iago` / badges (Tests, npm, MIT,
   Bun) / bold tagline / *"Awk! Awk! Add a diagram!"* quote.
2. **See it** *(new)* — one **rendered ` ```mermaid ` block** (GitHub renders it
   inline) showing what Iago posts on a PR, so a human sees the output before
   reading. Use a compact example (the `flow` example from `iago/examples/`).
   One caption line: "Iago turns a diff into this, on top of your `/review`."
3. **Three condensed bullets** — (a) it's a skill; your agent draws the diagram
   on a PR's `/review` comment; (b) works across Claude Code / Codex / Copilot /
   Gemini; (c) type auto-detected (sequence/flow/class/er), override anytime. No
   API key, no SaaS.
4. **## Quick start** — the 30-second path only:
   - Runtime: `bun` + authenticated `gh`.
   - Install (recommended): `bunx @drakulavich/iago install --force` (with the
     Claude plugin one-liner as a one-line alternative).
   - Use: run `/review`, then `/iago` (mention `/squawk`).
   - Two links: **all install options →** `docs/install.md`,
     **usage & types →** `docs/usage.md`.
5. **## Why?** — trimmed to 2–3 lines (Greptile/CodeRabbit draw diagrams; your
   `/review` doesn't; Iago fills the gap using the agent you already run, no SaaS).
6. **## Docs** — a link hub:
   - Install (all agents/options) → `docs/install.md`
   - Usage, diagram types & `/review` hookup → `docs/usage.md`
   - Diagram-selection rubric → `iago/references/diagram-selection.md` *(link the
     canonical file; do not duplicate it)*
   - Contributing / build & test → `docs/development.md`
   - Agent config → `AGENTS.md` / `CLAUDE.md`
7. **## License** — one line (MIT).

## New `docs/` files (content relocated from the README)

- **`docs/install.md`** — runtime requirements + all install paths in full:
  Node/Bun installer (all flags: `--target`, `--version`, `--dry-run`, `doctor`,
  `uninstall`), Claude plugin (marketplace add/install/reload, namespacing
  `/iago:iago`, community-marketplace note, bare-name skill-copy), Codex CLI,
  Copilot/Gemini. Paths come from the installer (`bunx … doctor`) — don't
  hardcode divergent ones.
- **`docs/usage.md`** — full invoke syntax (`/iago [pr] [type] [--mode=…]`),
  accepted types + aliases (`flow`/`flowchart`, `er`/`erd`/`entity`), `--mode`
  behavior, the plugin-namespace note, and the **`/review` hookup** (marker
  `<!-- review-skill -->`, fallback to newest `#/##/### Review` by the viewer).
- **`docs/development.md`** — repo layout tree + build/test (`cd cli && bun test`,
  `bun run typecheck`, `claude plugin validate . --strict`) + the CI note
  (macOS BSD-tar leg, `IAGO_LOCAL_TARBALL`).

## Content-reduction principles

- One canonical home per topic; the README points, it doesn't restate.
- Lead with output and the single happy-path; defer options, edge cases, and
  contributor detail to `docs/`.
- Keep prose tight: prefer a command + one-line note over paragraphs.

## Cross-links

README → `docs/{install,usage,development}.md` and `iago/references/diagram-selection.md`.
Each `docs/*` file links back to the README. `AGENTS.md` already redirects to
`CLAUDE.md`; the README's Docs hub also surfaces them. No content duplicated
between README and `docs/` — the README has only the lead example, the 3
bullets, quick start, a short Why, and the link hub.

## Out of scope / keep

- No change to `CLAUDE.md` / `AGENTS.md` (canonical agent config stays as-is).
- No change to the skill, `cli/`, or manifests.
- The rendered example in the README is illustrative; it is not auto-generated.
