#!/usr/bin/env bats
#
# Tests for the plugin/marketplace manifests.
# Structural assertions use jq; the validate test gates on the claude CLI.

load 'helpers/common'

setup() {
  setup_common
  command -v jq >/dev/null || skip "jq not installed"
}
teardown() { teardown_common; }

MANIFEST() { echo "$REPO_ROOT/.claude-plugin/marketplace.json"; }

@test "marketplace.json is valid JSON" {
  run jq empty "$(MANIFEST)"
  assert_success
}

@test "marketplace lists exactly one plugin" {
  run jq '.plugins | length' "$(MANIFEST)"
  assert_success
  assert_output_equals "1"
}

@test "the single marketplace plugin is named iago" {
  run jq -r '.plugins[0].name' "$(MANIFEST)"
  assert_success
  assert_output_equals "iago"
}

@test "no marketplace plugin is named squawk" {
  run jq -r '[.plugins[].name] | index("squawk") // "absent"' "$(MANIFEST)"
  assert_success
  assert_output_contains "absent"
}

@test "claude plugin validate --strict passes" {
  command -v claude >/dev/null || skip "claude CLI not installed"
  run claude plugin validate "$REPO_ROOT" --strict
  assert_success
  assert_output_contains "Validation passed"
}
