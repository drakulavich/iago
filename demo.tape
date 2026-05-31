# VHS tape for the README demo GIF.
# Run with: vhs demo.tape
# Output:   demo.gif (committed at repo root via Git LFS, referenced by README.md).
#
# Shows the one-command install of the Iago skill across every supported agent
# (Claude Code / Codex / Copilot / Gemini / opencode), then `doctor` confirming
# each one is wired up. The diagram Iago actually posts is the rendered Mermaid
# block in README.md — a terminal screencast can only show the CLI.

Output demo.gif

Set Shell "bash"

# Match the kesha-voice-kit demo aesthetic for a consistent look across repos.
Set Width 1500
Set Height 940
Set FontSize 22
Set Theme "Catppuccin Mocha"
Set Padding 24
Set TypingSpeed 60ms

# Hidden setup: sandbox HOME to a short throwaway dir so the demo never touches
# the recorder's real agent dirs *and* the printed install paths stay readable
# (a deep mktemp path wraps every line). Also warm the bunx cache so the visible
# runs are snappy. None of this appears in the GIF.
Hide
Type "rm -rf /tmp/iago-demo && mkdir -p /tmp/iago-demo && export HOME=/tmp/iago-demo PS1='$ '"
Enter
Type "bunx @drakulavich/iago version >/dev/null 2>&1; clear"
Enter
Sleep 2s
Show

Sleep 1s

# 1) One command, every agent. Auto-creates the skill dirs and drops in both
#    the /iago skill and its /squawk alias.
Type "bunx @drakulavich/iago install --target=all --force"
Sleep 500ms
Enter
# Give the GitHub tarball fetch + per-agent install time to render.
Sleep 7s

# 2) Confirm: each agent now has iago + squawk at the installed version.
Type "bunx @drakulavich/iago doctor"
Sleep 500ms
Enter
Sleep 6s
