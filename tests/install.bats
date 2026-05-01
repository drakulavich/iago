#!/usr/bin/env bats
#
# Tests for install.sh.
#
# Pyramid (Fowler): mostly integration tests that drive the script end-to-end
# against an isolated $HOME, plus a few unit tests for argument parsing.
# All tests are offline — they read from a local fake tarball via the
# IAGO_LOCAL_TARBALL hook so we never hit the network.

load 'helpers/common'

setup()    { setup_common; }
teardown() { teardown_common; }

# ---------- unit: argument parsing ------------------------------------------

@test "--help prints usage and exits 0" {
  run bash "$INSTALL_SH" --help
  assert_success
  assert_output_contains "Usage:"
}

@test "rejects unknown flag" {
  run bash "$INSTALL_SH" --bogus
  assert_failure
  assert_output_contains "Unknown argument"
}

@test "rejects invalid --target value" {
  run bash "$INSTALL_SH" --target=mars --force
  assert_failure
  assert_output_contains "Invalid --target"
}

@test "rejects invalid --skill-only value" {
  run bash "$INSTALL_SH" --skill-only=potato --force
  assert_failure
  assert_output_contains "Invalid --skill-only"
}

# ---------- integration: install --------------------------------------------

@test "installs both skills with --target=claude --force" {
  run bash "$INSTALL_SH" --target=claude --force
  assert_success
  assert_file_exists "$HOME/.claude/skills/iago/SKILL.md"
  assert_file_exists "$HOME/.claude/skills/squawk/SKILL.md"
  assert_output_contains "ready"
}

@test ".iago-version sentinel equals the explicit --version we passed" {
  run bash "$INSTALL_SH" --target=claude --version=v9.9.9 --force
  assert_success
  [ "$(cat "$HOME/.claude/skills/iago/.iago-version")" = "v9.9.9" ]
}

@test "is idempotent — re-running with same version doesn't fail" {
  run bash "$INSTALL_SH" --target=claude --version=v9.9.9 --force
  assert_success
  # Touch a marker file before re-running; it must be replaced (not preserved).
  echo "stale" > "$HOME/.claude/skills/iago/SKILL.md.touched"
  run bash "$INSTALL_SH" --target=claude --version=v9.9.9 --force
  assert_success
  # SKILL.md is fresh from the tarball.
  assert_file_exists "$HOME/.claude/skills/iago/SKILL.md"
  # The "touched" marker we added earlier is gone — we replaced the whole dir.
  assert_file_missing "$HOME/.claude/skills/iago/SKILL.md.touched"
}

@test "--skill-only=iago installs only iago, not squawk" {
  run bash "$INSTALL_SH" --target=claude --version=v0.0.1 --skill-only=iago --force
  assert_success
  assert_file_exists "$HOME/.claude/skills/iago/SKILL.md"
  assert_file_missing "$HOME/.claude/skills/squawk"
}

@test "--target=both installs into all four directories" {
  run bash "$INSTALL_SH" --target=both --version=v0.0.1 --force
  assert_success
  assert_file_exists "$HOME/.claude/skills/iago/SKILL.md"
  assert_file_exists "$HOME/.agents/skills/iago/SKILL.md"
  assert_file_exists "$HOME/.copilot/skills/iago/SKILL.md"
  assert_file_exists "$HOME/.gemini/skills/iago/SKILL.md"
}

@test "auto-detect picks existing dirs only" {
  mkdir -p "$HOME/.agents/skills"   # only Codex pre-exists
  run bash "$INSTALL_SH" --version=v0.0.1 --force
  assert_success
  assert_file_exists "$HOME/.agents/skills/iago/SKILL.md"
  assert_file_missing "$HOME/.claude/skills/iago"
  assert_file_missing "$HOME/.copilot/skills/iago"
}

@test "auto-detect creates ~/.claude/skills when nothing exists" {
  run bash "$INSTALL_SH" --version=v0.0.1 --force
  assert_success
  assert_file_exists "$HOME/.claude/skills/iago/SKILL.md"
  # Other targets are not created.
  assert_file_missing "$HOME/.agents/skills/iago"
}

# ---------- integration: dry-run --------------------------------------------

@test "--dry-run prints planned actions but writes nothing" {
  run bash "$INSTALL_SH" --target=claude --version=v0.0.1 --dry-run --force
  assert_success
  assert_output_contains "would install"
  assert_file_missing "$HOME/.claude/skills/iago"
  assert_file_missing "$HOME/.claude/skills/squawk"
}

# ---------- integration: overwrite safety -----------------------------------

@test "refuses to overwrite without --force in non-interactive mode" {
  # First install sets up a directory we'd then clobber.
  bash "$INSTALL_SH" --target=claude --version=v0.0.1 --force >/dev/null
  # Re-run without --force, and with stdin closed (non-tty) to simulate piping.
  run bash -c "bash '$INSTALL_SH' --target=claude --version=v0.0.1 < /dev/null"
  assert_failure
  assert_output_contains "Refusing to overwrite without --force"
}

# ---------- integration: uninstall ------------------------------------------

@test "--uninstall removes installed skills" {
  bash "$INSTALL_SH" --target=claude --version=v0.0.1 --force >/dev/null
  assert_file_exists "$HOME/.claude/skills/iago"
  run bash "$INSTALL_SH" --target=claude --uninstall
  assert_success
  assert_file_missing "$HOME/.claude/skills/iago"
  assert_file_missing "$HOME/.claude/skills/squawk"
}

@test "--uninstall on a clean machine warns and exits 0" {
  run bash "$INSTALL_SH" --target=claude --uninstall
  assert_success
  assert_output_contains "Nothing to uninstall"
}

# ---------- integration: corrupt tarball -----------------------------------

@test "fails clearly when local tarball is missing" {
  IAGO_LOCAL_TARBALL="/nonexistent/iago.tar.gz" \
    run bash "$INSTALL_SH" --target=claude --version=v0.0.1 --force
  assert_failure
  assert_output_contains "IAGO_LOCAL_TARBALL not found"
}
