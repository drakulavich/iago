#!/usr/bin/env bash
# append_diagram.sh — idempotently append/replace a iago Mermaid block
# inside the most recent /review comment on a GitHub PR. Falls back to a new
# comment if no /review comment is found or --mode=comment is passed.
#
# Required tools: gh (authenticated), jq.
#
# Usage:
#   append_diagram.sh --repo OWNER/REPO --pr 123 --mode append|comment \
#                     --diagram-file /path/to/wrapped-block.md

set -euo pipefail

REPO=""
PR=""
MODE="append"
DIAGRAM_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)         REPO="$2"; shift 2 ;;
    --pr)           PR="$2"; shift 2 ;;
    --mode)         MODE="$2"; shift 2 ;;
    --diagram-file) DIAGRAM_FILE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

for v in REPO PR DIAGRAM_FILE; do
  if [[ -z "${!v}" ]]; then
    echo "Missing required arg: $v" >&2
    exit 2
  fi
done

if [[ ! -f "$DIAGRAM_FILE" ]]; then
  echo "Diagram file not found: $DIAGRAM_FILE" >&2
  exit 2
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required" >&2; exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2; exit 2
fi

OWNER="${REPO%%/*}"
NAME="${REPO##*/}"

DIAGRAM_BLOCK="$(cat "$DIAGRAM_FILE")"

post_new_comment() {
  local tmp
  tmp="$(mktemp)"
  printf '%s\n' "$DIAGRAM_BLOCK" > "$tmp"
  local url
  url="$(gh pr comment "$PR" --repo "$REPO" --body-file "$tmp" 2>&1 | tail -n1)"
  rm -f "$tmp"
  printf 'Posted new comment: %s\n' "$url"
}

if [[ "$MODE" == "comment" ]]; then
  post_new_comment
  exit 0
fi

# --mode=append: find the /review comment.
#
# Strategy:
#   1. Look for the most recent comment containing the explicit marker
#      "<!-- review-skill -->" (preferred — emit this from your /review skill).
#   2. Otherwise, look for the most recent comment authored by the
#      authenticated user whose body starts with "## Review" or "# Review".
#
# We use the issues/comments API (PR comments are issue comments).

VIEWER="$(gh api graphql -f query='{viewer{login}}' -q .data.viewer.login)"

COMMENTS_JSON="$(gh api \
  --paginate \
  -H "Accept: application/vnd.github+json" \
  "/repos/${OWNER}/${NAME}/issues/${PR}/comments")"

# 1. Marker match.
TARGET_ID="$(jq -r '
  [ .[] | select(.body | contains("<!-- review-skill -->")) ]
  | sort_by(.created_at) | last | .id // empty
' <<<"$COMMENTS_JSON")"

# 2. Heading + author fallback.
if [[ -z "$TARGET_ID" ]]; then
  TARGET_ID="$(jq -r --arg me "$VIEWER" '
    [ .[]
      | select(.user.login == $me)
      | select(.body | test("^\\s*#{1,3}\\s+Review\\b"; "m"))
    ]
    | sort_by(.created_at) | last | .id // empty
  ' <<<"$COMMENTS_JSON")"
fi

if [[ -z "$TARGET_ID" ]]; then
  echo "No /review comment found; posting standalone comment instead." >&2
  post_new_comment
  exit 0
fi

CURRENT_BODY="$(jq -r --argjson id "$TARGET_ID" '
  .[] | select(.id == $id) | .body
' <<<"$COMMENTS_JSON")"

# Replace any prior iago block (matches both new 'iago:' markers and legacy
# 'pr-diagrams:' markers from earlier versions); otherwise append.
PYTHON="$(command -v python3 || command -v python || true)"
if [[ -z "$PYTHON" ]]; then
  echo "python3 (or python) is required for safe in-place replacement" >&2
  exit 2
fi

NEW_BODY="$("$PYTHON" - "$CURRENT_BODY" "$DIAGRAM_BLOCK" <<'PY'
import re, sys
current, block = sys.argv[1], sys.argv[2]
pattern = re.compile(
    r"<!--\s*(?:iago|pr-diagrams):begin\s*-->.*?<!--\s*(?:iago|pr-diagrams):end\s*-->",
    re.DOTALL,
)
if pattern.search(current):
    out = pattern.sub(block.strip(), current)
else:
    sep = "" if current.endswith("\n") else "\n"
    out = current + sep + "\n" + block.strip() + "\n"
sys.stdout.write(out)
PY
)"

# PATCH the comment.
RESP="$(gh api \
  -X PATCH \
  -H "Accept: application/vnd.github+json" \
  "/repos/${OWNER}/${NAME}/issues/comments/${TARGET_ID}" \
  -f body="$NEW_BODY")"

URL="$(jq -r '.html_url' <<<"$RESP")"
printf 'Updated /review comment: %s\n' "$URL"
