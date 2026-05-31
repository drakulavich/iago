# Using Iago

← [back to README](../README.md)

## Invoke

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

> Installed as a Claude Code **plugin**? The commands are namespaced: use
> `/iago:iago` and `/iago:squawk`. The bare `/iago` / `/squawk` above apply to
> the manual skill-copy and Codex installs.

## How it picks the diagram type

Auto-detected from the diff (priority order — first match wins):

| Signal | Type |
|---|---|
| Migrations / `*.sql` / `schema.prisma` / ORM models | `er` |
| ≥2 OO files with new `class` / `interface` / `trait` | `class` |
| Cross-component request flow (handler + client + worker) | `sequence` |
| Branching / state-machine / non-trivial logic | `flow` |
| Trivial change (docs / deps / formatting) | **abstain** |

Override anytime: `/iago sequence`, `/iago er`, etc. Full rubric:
[`iago/references/diagram-selection.md`](../iago/references/diagram-selection.md).

## Hooking it to your /review skill

Best UX is: run `/review` first, then `/iago` in the same session. Iago finds
your `/review` comment by looking for the marker `<!-- review-skill -->` in its
body.

If your review skill doesn't emit that marker, Iago falls back to the most
recent comment by you starting with `# Review`, `## Review`, or `### Review`.
