# Iago — Baseline Specifications

This directory is the **baseline spec corpus**: it captures how Iago *actually
behaves today*, one capability per directory, so future work can be proposed as
OpenSpec change deltas against a trustworthy reference instead of tribal knowledge.

> **Disclaimer (living document).** These specs describe the current release and
> are updated whenever behavior changes. If a spec and the code disagree, the code
> is the bug *or* the spec is stale — either way, open an issue; don't silently
> trust one side.

> **Status.** The corpus is being established. Capabilities are extracted into
> `specs/<name>/spec.md` as they are written; the table below lists the planned
> set and links each one once its spec lands. Until then, `CLAUDE.md`,
> `iago/SKILL.md`, and `docs/superpowers/` are the closest record.

## How to read these specs

Every spec follows the same shape:

- **Purpose** — what the capability does and for whom.
- **Non-Goals** — what it deliberately does *not* do (so nobody "fixes" that).
- **Requirements** — verifiable contracts (`SHALL`), each with at least one
  happy-path and one error/edge **Scenario** in Given/When/Then form.
- **Technical Notes** — constants, tables, and `file:line` traceability refs,
  kept out of the requirement text so contracts stay readable.
- **Open Issues** — known gaps, tracked by GitHub issue where one exists.

Terminology is canonical: every term of art (Skill, Host agent, Diagram type,
`/review` comment, …) is defined once in [GLOSSARY.md](GLOSSARY.md) and used
verbatim everywhere else.

## Personas

Specs reference these named personas instead of a generic "user":

- **Pasha, the review author** — runs `/iago` (or `/squawk`) on a pull request to
  append a visual summary to the `/review` comment. Cares about correct
  diagram-type auto-detection, GitHub-safe Mermaid rendering, and idempotent
  re-runs (the diagram is replaced in place, never duplicated).
- **Devin, the toolchain integrator** — installs Iago across Claude Code, Codex,
  Copilot, Gemini, and opencode via `bunx @drakulavich/iago install`. Cares about
  install targets, `doctor` output, and version alignment across the plugin and
  marketplace manifests.
- **Mira, the skill maintainer** — edits `iago/SKILL.md`, the diagram-selection
  rubric, and the Mermaid templates. Cares about the runtime constraints — bun +
  gh only, the dependency-free skill folder, no Action, and Mermaid
  reserved-keyword safety.

## Capabilities

| Spec | Covers |
|---|---|
| diagram-append | `/iago` / `/squawk`: append a Mermaid diagram to the PR's `/review` comment; re-run replaces in place; `--mode=comment` posts standalone |
| diagram-selection | Auto-detect the diagram type (sequence / flow / class / er) from the diff; explicit override |
| mermaid-authoring | Per-type templates, reserved-keyword safety, sequence-label sanitization |
| installer-cli | `install` / `doctor`, per-agent install targets, version alignment |
| distribution | Skill folders (`iago/`, `squawk/`), Claude Code plugin, npm package |

*(Links are added as each `spec.md` is written; rows without a link are not yet
extracted — see Status above.)*

## Validation

```bash
openspec spec list                    # enumerate capabilities
openspec validate --specs --strict    # structural validation — must exit 0
```

These commands require the standalone **OpenSpec CLI** — a global developer tool
installed separately, not an Iago dependency. The specs themselves are plain
Markdown and reviewable without it.
