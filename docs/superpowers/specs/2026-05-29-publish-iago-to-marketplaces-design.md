# Publishing iago to public Claude Code plugin directories

**Date:** 2026-05-29
**Status:** Approved design
**Goal:** Get the iago plugin listed in public, discoverable Claude Code plugin
directories — primarily Anthropic's community marketplace, with the algorithmic
aggregators in parallel.

## Context

The repo already self-hosts a marketplace (`.claude-plugin/marketplace.json` +
`.claude-plugin/plugin.json`), and the README documents installing it via
`/plugin marketplace add drakulavich/iago`. So the "host your own marketplace"
path is done. This effort is purely about **discoverability** — getting iago
into directories people browse without already knowing the repo.

### The directory landscape (verified May 2026)

| Tier | What it is | How you get in | Trust |
|---|---|---|---|
| `claude-plugins-official` | Anthropic-curated, auto-available in every install | No application; Anthropic's discretion. Submit forms do NOT feed it. | Highest |
| `claude-community` (`anthropics/claude-plugins-community`) | Public vetted third-party marketplace, SHA-pinned | In-app submit form → `claude plugin validate` + safety screening → nightly sync | High (official on-ramp) |
| Aggregators (claudemarketplaces.com, awesome-claude-plugins, everything-claude-code, …) | GitHub crawlers / hand-curated lists | Mostly algorithmic (stars/installs/votes); some take PRs | Variable |

Key facts:
- The **community marketplace is the only submittable official path**. Submit at
  `claude.ai/settings/plugins/submit` or `platform.claude.com/plugins/submit`.
- It runs `claude plugin validate` (runnable locally first) + automated safety
  screening. Approved plugins are **SHA-pinned**; CI auto-bumps the pin on new
  commits; the public catalog **syncs nightly** (expect a delay before it is
  installable as `@claude-community`).
- The **official** marketplace cannot be applied to. Community is the realistic
  on-ramp; Anthropic may promote from there.
- The biggest indexer, **claudemarketplaces.com, is algorithmic** (ranks by
  install count / GitHub stars / votes) — no submit form. Listing is earned.

## Chosen approach: C — Both, sequenced

Resolve the validation blocker → submit to `claude-community` (trust anchor) →
in parallel add GitHub topics + awesome-list PRs so algorithmic indexers crawl.
The prep work for community validation is the same work that makes aggregators
rank well, so it is done once and reused everywhere.

## Design

### 1. Fix the validation blocker (structural)

**Problem:** `marketplace.json` lists **two** plugins (`iago`, `squawk`), both
with `source: "./"`, while `plugin.json` already models them as **one** plugin
`iago` bundling two skills (`./iago`, `./squawk`). This split identity is the
most likely `claude plugin validate` failure and reads as a duplicate listing.

**Decision:** Collapse to a **single plugin `iago` that ships both skills**.
`squawk` remains a skill *inside* the iago plugin. Marketplace lists one plugin.

- Plugin-installed users invoke `/iago:iago` and `/iago:squawk` (namespaced).
- Standalone `/iago` and `/squawk` triggers for non-plugin installs are
  unaffected (the skill folders and their triggers stay as they are).
- `marketplace.json` drops the second (`squawk`) plugin entry. `plugin.json`
  already lists both skills — no change needed there.

### 2. Local validation gate (before any submission)

- Run `claude plugin validate` against the repo; fix everything it flags.
- Install from the self-hosted marketplace as a real user
  (`/plugin marketplace add drakulavich/iago` →
  `/plugin install iago@iago-marketplace`) and confirm `/iago:iago` and
  `/iago:squawk` load and run end-to-end.
- Keep `version` pinned explicitly (`0.1.0`) so users get controlled updates,
  not per-commit churn.

### 3. Community marketplace submission (trust anchor)

- Submit via `claude.ai/settings/plugins/submit` (or
  `platform.claude.com/plugins/submit`).
- Passes Anthropic's `claude plugin validate` + automated safety screening; on
  approval iago is SHA-pinned in `anthropics/claude-plugins-community`, CI
  auto-bumps the pin on new commits, and the catalog syncs nightly.
- This is also the only realistic on-ramp to the curated official marketplace.

### 4. Aggregator track (breadth, in parallel)

- Add GitHub **topics**: `claude-code`, `claude-plugin`, `claude-code-plugin`,
  `mermaid`, `code-review` — what algorithmic crawlers key off.
- Open PRs to the main hand-curated lists (e.g. `hesreallyhim/awesome-claude-code`,
  `Chat2AnyLLM/awesome-claude-plugins`).
- Keep the one-command install (`/plugin marketplace add drakulavich/iago`)
  above the fold in the README (already present).
- Indexer *ranking* is earned via stars/installs over time; listing is the
  immediate goal, ranking follows.

### 5. Maintenance posture

- Treat `version` bumps in `plugin.json` + `marketplace.json` as the release
  signal, kept in lockstep with the existing tag-based npm publish flow.
- Re-run `claude plugin validate` in CI so no commit breaks the community SHA
  bump.

## Out of scope (YAGNI)

- No new install channels (Action / npm / curl / manual already exist).
- No rewrite of the skill content itself; this is packaging + publishing only.

## Success criteria

- `claude plugin validate` passes locally and in CI.
- `marketplace.json` lists exactly one plugin (`iago`) bundling both skills.
- iago is submitted to and accepted by `claude-community` (installable as
  `iago@claude-community` after nightly sync).
- GitHub topics set; PRs opened to at least the two named awesome-lists.
