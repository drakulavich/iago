#!/usr/bin/env bash
# Note: associative arrays (`declare -A`) are bash 4+. macOS ships bash 3.2 by
# default, so we use a function instead — works on bash 3.2 through 5.x and
# stays compatible with `set -u`.
# iago installer / updater.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/drakulavich/iago/main/install.sh | bash
#
# With options:
#   curl -fsSL https://raw.githubusercontent.com/drakulavich/iago/main/install.sh | bash -s -- --target=claude
#   curl -fsSL https://raw.githubusercontent.com/drakulavich/iago/main/install.sh | bash -s -- --version=v0.1.1
#   curl -fsSL https://raw.githubusercontent.com/drakulavich/iago/main/install.sh | bash -s -- --uninstall
#
# Or local:
#   ./install.sh --target=both --version=latest
#
# Flags:
#   --target=<claude|codex|copilot|gemini|opencode|both|all>   Where to install. Default: auto-detect.
#   --version=<tag|latest>                            Tag to install (e.g. v0.1.1). Default: latest release.
#   --skill-only=<iago|squawk|both>                   Which skill to install. Default: both.
#   --dry-run                                         Print what would happen, change nothing.
#   --uninstall                                       Remove iago and squawk from selected target(s).
#   --force                                           Overwrite without confirmation prompt.
#   -h, --help                                        Show help.

set -euo pipefail

REPO="drakulavich/iago"
REPO_URL="https://github.com/${REPO}"

# ---------- styling ----------------------------------------------------------

if [[ -t 1 ]] && [[ "${NO_COLOR:-}" == "" ]]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'
  C_BLU=$'\033[34m'; C_DIM=$'\033[2m'; C_BLD=$'\033[1m'; C_RST=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YLW=""; C_BLU=""; C_DIM=""; C_BLD=""; C_RST=""
fi

say()  { printf '%s\n' "$*"; }
info() { printf '%s→%s %s\n' "$C_BLU" "$C_RST" "$*"; }
ok()   { printf '%s✓%s %s\n' "$C_GRN" "$C_RST" "$*"; }
warn() { printf '%s!%s %s\n' "$C_YLW" "$C_RST" "$*" >&2; }
die()  { printf '%s✗%s %s\n' "$C_RED" "$C_RST" "$*" >&2; exit 1; }
dim()  { printf '%s%s%s\n' "$C_DIM" "$*" "$C_RST"; }

# ---------- defaults ---------------------------------------------------------

TARGET="auto"
VERSION="latest"
SKILL_ONLY="both"
DRY_RUN=0
UNINSTALL=0
FORCE=0

# ---------- parse args -------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target=*)     TARGET="${1#*=}"; shift ;;
    --target)       TARGET="$2"; shift 2 ;;
    --version=*)    VERSION="${1#*=}"; shift ;;
    --version)      VERSION="$2"; shift 2 ;;
    --skill-only=*) SKILL_ONLY="${1#*=}"; shift ;;
    --skill-only)   SKILL_ONLY="$2"; shift 2 ;;
    --dry-run)      DRY_RUN=1; shift ;;
    --uninstall)    UNINSTALL=1; shift ;;
    --force)        FORCE=1; shift ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "Unknown argument: $1 (use --help)" ;;
  esac
done

case "$TARGET" in
  auto|claude|codex|copilot|gemini|opencode|both|all) ;;
  *) die "Invalid --target: $TARGET" ;;
esac
case "$SKILL_ONLY" in
  iago|squawk|both) ;;
  *) die "Invalid --skill-only: $SKILL_ONLY" ;;
esac

# ---------- preflight --------------------------------------------------------

require() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required tool: $1"
}
require curl
require tar
require uname

UNAME="$(uname -s)"
case "$UNAME" in
  Darwin|Linux) ;;
  *) die "Unsupported OS: $UNAME (only macOS and Linux)" ;;
esac

# Decide install paths. Function form (no associative arrays) so we work on
# bash 3.2 (default on macOS) under `set -u`.
target_dir() {
  case "$1" in
    claude)   printf '%s\n' "$HOME/.claude/skills" ;;
    codex)    printf '%s\n' "$HOME/.agents/skills" ;;
    copilot)  printf '%s\n' "$HOME/.copilot/skills" ;;
    gemini)   printf '%s\n' "$HOME/.gemini/skills" ;;
    opencode) printf '%s\n' "$HOME/.config/opencode/skills" ;;
    *)        return 1 ;;
  esac
}

selected_targets=()
if [[ "$TARGET" == "auto" ]]; then
  for k in claude codex copilot gemini opencode; do
    [[ -d "$(target_dir "$k")" ]] && selected_targets+=("$k")
  done
  if [[ ${#selected_targets[@]} -eq 0 ]]; then
    info "No existing skills directory found. Creating ~/.claude/skills as default."
    mkdir -p "$(target_dir claude)"
    selected_targets=(claude)
  fi
elif [[ "$TARGET" == "both" || "$TARGET" == "all" ]]; then
  for k in claude codex copilot gemini opencode; do
    selected_targets+=("$k")
  done
else
  selected_targets=("$TARGET")
fi

# Skills to act on.
selected_skills=()
case "$SKILL_ONLY" in
  iago)   selected_skills=(iago) ;;
  squawk) selected_skills=(squawk) ;;
  both)   selected_skills=(iago squawk) ;;
esac

# ---------- uninstall path ---------------------------------------------------

if [[ "$UNINSTALL" -eq 1 ]]; then
  info "Uninstalling iago from: ${selected_targets[*]}"
  any_removed=0
  for t in "${selected_targets[@]}"; do
    base="$(target_dir "$t")"
    [[ -d "$base" ]] || { dim "  skip $t (no $base)"; continue; }
    for s in "${selected_skills[@]}"; do
      target_path="$base/$s"
      if [[ -d "$target_path" ]]; then
        if [[ "$DRY_RUN" -eq 1 ]]; then
          dim "  would remove $target_path"
        else
          rm -rf -- "$target_path"
          ok "removed $target_path"
        fi
        any_removed=1
      fi
    done
  done
  [[ "$any_removed" -eq 0 ]] && warn "Nothing to uninstall."
  exit 0
fi

# ---------- resolve version -------------------------------------------------

resolve_latest() {
  # Use the GitHub API; fall back to "main" if API is unreachable.
  local tag
  tag="$(curl -fsSL --max-time 10 "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null \
         | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1 || true)"
  if [[ -z "$tag" ]]; then
    warn "Could not resolve latest release; falling back to 'main' branch."
    echo "main"
  else
    echo "$tag"
  fi
}

if [[ "$VERSION" == "latest" ]]; then
  VERSION="$(resolve_latest)"
fi
info "Installing iago ${C_BLD}${VERSION}${C_RST} from $REPO_URL"

# ---------- download tarball into a clean temp dir -------------------------

# Use a non-iago prefix so the SRC_DIR glob below doesn't accidentally
# match the temp dir itself.
TMP="$(mktemp -d -t iagoinst.XXXXXXXX 2>/dev/null || mktemp -d /tmp/iagoinst.XXXXXXXX)"
trap 'rm -rf -- "$TMP"' EXIT INT TERM

# Test hook: IAGO_LOCAL_TARBALL points to a local .tar.gz to use instead of
# downloading from GitHub. Used by the test suite to keep tests offline-fast.
if [[ -n "${IAGO_LOCAL_TARBALL:-}" ]]; then
  [[ -f "$IAGO_LOCAL_TARBALL" ]] || die "IAGO_LOCAL_TARBALL not found: $IAGO_LOCAL_TARBALL"
  info "Using local tarball: $IAGO_LOCAL_TARBALL"
  cp "$IAGO_LOCAL_TARBALL" "$TMP/iago.tar.gz"
  TARBALL_URL="(local: $IAGO_LOCAL_TARBALL)"
else
  TARBALL_URL="https://codeload.github.com/${REPO}/tar.gz/refs/tags/${VERSION}"
  # If VERSION is "main" or any branch, use heads/.
  if [[ "$VERSION" == "main" ]]; then
    TARBALL_URL="https://codeload.github.com/${REPO}/tar.gz/refs/heads/${VERSION}"
  fi
  info "Downloading ${TARBALL_URL}"
  if ! curl -fsSL --max-time 60 "$TARBALL_URL" -o "$TMP/iago.tar.gz"; then
    die "Download failed. Check your network or try --version=main."
  fi
fi

info "Extracting"
tar -xzf "$TMP/iago.tar.gz" -C "$TMP"
# Glob for the extracted top-level directory (e.g. iago-0.1.1/).
SRC_DIR="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d -name "iago-*" -print -quit)"
[[ -d "$SRC_DIR" ]] || die "Could not find extracted source dir under $TMP"

# Sanity: required source folders must exist.
for s in "${selected_skills[@]}"; do
  [[ -d "$SRC_DIR/$s" ]] || die "Source missing $s/ in $VERSION (downloaded ${TARBALL_URL})"
  [[ -f "$SRC_DIR/$s/SKILL.md" ]] || die "Source missing $s/SKILL.md in $VERSION"
done

# ---------- prompt before overwrite ----------------------------------------

needs_overwrite=()
for t in "${selected_targets[@]}"; do
  base="$(target_dir "$t")"
  for s in "${selected_skills[@]}"; do
    [[ -d "$base/$s" ]] && needs_overwrite+=("$base/$s")
  done
done

if [[ ${#needs_overwrite[@]} -gt 0 && "$FORCE" -ne 1 && "$DRY_RUN" -ne 1 ]]; then
  warn "The following will be replaced:"
  for p in "${needs_overwrite[@]}"; do printf '  %s\n' "$p"; done
  if [[ -t 0 ]]; then
    read -r -p "Continue? [y/N] " ans
    [[ "$ans" =~ ^[Yy]$ ]] || die "Aborted."
  else
    # Non-interactive (piped from curl): require --force.
    die "Refusing to overwrite without --force in non-interactive mode."
  fi
fi

# ---------- atomic install per skill ----------------------------------------

# Strategy: copy to a sibling temp dir under the parent, then atomic mv via
# rename(2) — first remove the live dir at the last possible moment to
# minimize the inconsistent window.

install_skill() {
  local src="$1" dest_parent="$2" name="$3"
  local staging="$dest_parent/.iago-staging-$$-$name"
  local final="$dest_parent/$name"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    dim "  would install $src -> $final"
    return 0
  fi

  mkdir -p "$dest_parent"
  rm -rf "$staging"
  cp -R "$src" "$staging"
  # Keep a backup of the previous version next to the new install in case
  # something goes wrong; we delete it after a successful swap.
  local backup=""
  if [[ -d "$final" ]]; then
    backup="$dest_parent/.iago-backup-$$-$name"
    mv "$final" "$backup"
  fi
  if mv "$staging" "$final"; then
    [[ -n "$backup" ]] && rm -rf "$backup"
    ok "installed $name -> $final"
  else
    # rollback
    [[ -n "$backup" && -d "$backup" ]] && mv "$backup" "$final"
    rm -rf "$staging"
    die "Failed to install $name into $final"
  fi
}

for t in "${selected_targets[@]}"; do
  base="$(target_dir "$t")"
  info "Target: ${C_BLD}$t${C_RST} ($base)"
  mkdir -p "$base"
  for s in "${selected_skills[@]}"; do
    install_skill "$SRC_DIR/$s" "$base" "$s"
  done
done

# Drop a small VERSION marker so future runs can detect what's installed.
if [[ "$DRY_RUN" -ne 1 ]]; then
  for t in "${selected_targets[@]}"; do
    base="$(target_dir "$t")"
    for s in "${selected_skills[@]}"; do
      printf '%s\n' "$VERSION" > "$base/$s/.iago-version"
    done
  done
fi

# ---------- summary ----------------------------------------------------------

echo
ok "iago $VERSION ready."
echo
say "${C_BLD}Next steps${C_RST}"
say "  • Restart your CLI session (Claude Code / Codex / etc.) to pick up new skills."
say "  • Try it on a PR: ${C_BLD}/iago${C_RST} or ${C_BLD}/squawk${C_RST}."
say "  • Docs: ${REPO_URL}#readme"
echo
dim "To update later: re-run this script."
dim "To uninstall:    re-run with --uninstall."
