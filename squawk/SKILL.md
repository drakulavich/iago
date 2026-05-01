---
name: squawk
description: Alias for the `iago` skill. Appends a Mermaid diagram (sequence, flow, class, or entity-relation) to a GitHub PR's existing /review comment. Use whenever the user invokes /squawk or says "squawk this PR".
when_to_use: User invokes /squawk, says "squawk", or asks to append a diagram to a PR review and prefers this alias.
argument-hint: "[pr-number] [type?] [--mode=append|comment]"
allowed-tools:
  - Bash(gh pr view *)
  - Bash(gh pr diff *)
  - Bash(gh pr list *)
  - Bash(gh api *)
  - Bash(gh auth status)
  - Bash(git diff *)
  - Bash(git log *)
  - Bash(git rev-parse *)
  - Read
  - Grep
  - Glob
---

# squawk — alias for `iago`

This skill is a thin alias. The full behavior, rubric, templates, and
helper script live in the `iago` skill in the same repository.

**Do exactly what `iago/SKILL.md` says.** Read that file first, then
follow it step-by-step using the same `$ARGUMENTS` you received.

Concretely:

1. Read `iago/SKILL.md` from the sibling directory next to this skill, and
   treat it as your operating instructions. The two skills are always
   installed side-by-side; the `iago/` directory is right next to this
   `squawk/` directory in whichever skills folder your runtime uses
   (`~/.claude/skills/`, `~/.agents/skills/`, `~/.config/opencode/skills/`,
   etc.).
2. Use the helper at `../iago/scripts/append_diagram.sh` (relative to this
   skill's directory) when it's time to post the diagram.
3. Use the references and examples under `../iago/` for selection rules and
   Mermaid syntax.

Do not duplicate logic here — keep `iago` as the single source of truth.
