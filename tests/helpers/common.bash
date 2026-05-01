# Shared helpers for the install.sh test suite.
#
# Each test gets:
#   - a fresh isolated $HOME under /tmp
#   - a local fake tarball passed via $IAGO_LOCAL_TARBALL (no network)
#   - $INSTALL_SH pointing to the script under test
#   - $REPO_ROOT pointing to the project root
#
# Conventions:
#   - We assert on observable behavior (filesystem state, exit code, output),
#     never on internal functions. Following Fowler: "never test
#     implementation details".

# bats-* libraries (assert, support) live one level above tests/. We don't
# require them — keep tests vendor-free for now and use plain bash asserts.

setup_common() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  INSTALL_SH="$REPO_ROOT/install.sh"

  # Per-test isolation. BATS_TEST_TMPDIR is bats-core 1.7+; fall back to mktemp.
  if [[ -n "${BATS_TEST_TMPDIR:-}" ]]; then
    TEST_TMP="$BATS_TEST_TMPDIR"
  else
    TEST_TMP="$(mktemp -d /tmp/iago-test.XXXXXX)"
  fi

  TEST_HOME="$TEST_TMP/home"
  mkdir -p "$TEST_HOME"
  export HOME="$TEST_HOME"

  # Build a synthetic tarball that mimics the GitHub codeload layout.
  # codeload puts everything under "iago-<version>/...".
  export IAGO_LOCAL_TARBALL="$TEST_TMP/iago.tar.gz"
  build_fake_tarball "$IAGO_LOCAL_TARBALL" "0.1.99"

  # Disable colors so output assertions are simple.
  export NO_COLOR=1
}

teardown_common() {
  # bats handles BATS_TEST_TMPDIR cleanup; only clean up our fallback.
  if [[ -z "${BATS_TEST_TMPDIR:-}" && -d "${TEST_TMP:-}" ]]; then
    rm -rf "$TEST_TMP"
  fi
}

# Build a tarball with the same structure as the real GitHub release:
#   iago-<version>/iago/SKILL.md
#   iago-<version>/squawk/SKILL.md
#   iago-<version>/iago/scripts/append_diagram.sh
#   iago-<version>/iago/references/...
#   iago-<version>/iago/examples/...
build_fake_tarball() {
  local out="$1" version="$2"
  local stage="$(mktemp -d /tmp/iago-fake.XXXXXX)"
  local root="$stage/iago-$version"
  mkdir -p "$root/iago/scripts" "$root/iago/references" "$root/iago/examples" "$root/squawk"

  cat > "$root/iago/SKILL.md" <<EOF
---
name: iago
description: fake skill for tests
---
# fake iago $version
EOF

  cat > "$root/squawk/SKILL.md" <<EOF
---
name: squawk
description: fake alias for tests
---
# fake squawk $version
EOF

  echo "#!/usr/bin/env bash" > "$root/iago/scripts/append_diagram.sh"
  chmod +x "$root/iago/scripts/append_diagram.sh"
  echo "selection rubric placeholder" > "$root/iago/references/diagram-selection.md"
  echo "templates placeholder"        > "$root/iago/references/mermaid-templates.md"
  echo "sequence example" > "$root/iago/examples/sequence.md"

  tar -czf "$out" -C "$stage" "iago-$version"
  rm -rf "$stage"
}

# Assert helpers (vendor-free).
assert_success() {
  if [[ "$status" -ne 0 ]]; then
    printf 'expected status 0, got %s\noutput:\n%s\n' "$status" "$output" >&2
    return 1
  fi
}
assert_failure() {
  if [[ "$status" -eq 0 ]]; then
    printf 'expected non-zero status, got 0\noutput:\n%s\n' "$output" >&2
    return 1
  fi
}
assert_output_contains() {
  local needle="$1"
  if [[ "$output" != *"$needle"* ]]; then
    printf 'expected output to contain: %s\nactual output:\n%s\n' "$needle" "$output" >&2
    return 1
  fi
}
assert_file_exists() {
  if [[ ! -e "$1" ]]; then
    printf 'expected file to exist: %s\n' "$1" >&2
    return 1
  fi
}
assert_file_missing() {
  if [[ -e "$1" ]]; then
    printf 'expected file to be missing: %s\n' "$1" >&2
    return 1
  fi
}
