#!/usr/bin/env bash
# Run the local test suite. Auto-installs bats if missing.
#
# Usage:
#   ./scripts/test.sh                  # all tests
#   ./scripts/test.sh tests/install.bats   # specific file
#   ./scripts/test.sh -f "uninstall"   # filter by name

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v bats >/dev/null 2>&1; then
  echo "bats not found — installing..."
  case "$(uname -s)" in
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        brew install bats-core
      else
        echo "Homebrew not available; install bats-core manually: https://bats-core.readthedocs.io" >&2
        exit 1
      fi
      ;;
    Linux)
      if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update -qq && sudo apt-get install -y -qq bats
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y bats
      else
        echo "Install bats-core manually: https://bats-core.readthedocs.io" >&2
        exit 1
      fi
      ;;
    *)
      echo "Unsupported OS: $(uname -s). Install bats-core manually." >&2
      exit 1
      ;;
  esac
fi

if [[ $# -eq 0 ]]; then
  bats --print-output-on-failure tests/
else
  bats --print-output-on-failure "$@"
fi
