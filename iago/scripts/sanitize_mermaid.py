#!/usr/bin/env python3
"""Sanitize a markdown blob containing fenced ```mermaid blocks.

Models keep slipping ';' into sequence-diagram message labels (e.g.
'Boot-->>User: printUsage(); exit 0'), and GitHub's Mermaid parser treats
';' as a statement separator inside sequenceDiagram, so the trailing half
blows up. Prompt-side guidance helps but isn't a guarantee. This script
is the deterministic safety net the skill runs before posting.

Scope of the rewrite is intentionally narrow:
  - only inside fenced ```mermaid blocks
  - only on lines that look like a sequence-diagram message
    (Actor<arrow>Other: ...) -- never touches flowcharts/class/er bodies,
    Notes, participants, or prose outside fences
  - replaces ';' with ',' in the message text only (after the first ':')

Reads the full markdown body from argv[1] (or stdin if no argv) and writes
the sanitized result to stdout. On any unexpected error we print the
original input unchanged so the caller can fall back gracefully.
"""

from __future__ import annotations

import re
import sys


FENCE = re.compile(r"(```mermaid\n)(.*?)(\n```)", re.DOTALL)

# Sequence-message line: <participant><arrow><participant>: <text>
# Arrows: ->>, -->>, ->, -->, -), --), -x, --x, ->>+, ->>-
MSG = re.compile(
    r"^(\s*[A-Za-z_][\w]*\s*(?:->>?[+-]?|-->>?|--?\)|--?x)\s*[A-Za-z_][\w]*\s*:)(.*)$"
)


def rewrite_block(body: str) -> str:
    out = []
    for line in body.split("\n"):
        m = MSG.match(line)
        if m:
            head, tail = m.group(1), m.group(2)
            tail = tail.replace(";", ",")
            out.append(head + tail)
        else:
            out.append(line)
    return "\n".join(out)


def sanitize(src: str) -> str:
    return FENCE.sub(
        lambda m: m.group(1) + rewrite_block(m.group(2)) + m.group(3),
        src,
    )


def main() -> int:
    src = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    try:
        sys.stdout.write(sanitize(src))
    except Exception:
        sys.stdout.write(src)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
