#!/usr/bin/env python3
"""Replace ';' with ',' in sequence-diagram message labels inside ```mermaid fences.

GitHub's Mermaid parser treats ';' as a statement separator inside
sequenceDiagram, so a stray ';' in a message label truncates the line.

Scope:
  - only inside fenced ```mermaid blocks
  - only on lines matching <participant><arrow><participant>: <text>
  - never touches flowcharts/class/er bodies, Notes, participants, prose

Reads markdown from argv[1] (or stdin) and writes sanitized output to stdout.
"""

import re
import sys


FENCE = re.compile(r"(```mermaid\n)(.*?)(\n```)", re.DOTALL)

# Arrows: ->>, -->>, ->, -->, -), --), -x, --x, ->>+, ->>-
MSG = re.compile(
    r"^(\s*[A-Za-z_][\w]*\s*(?:->>?[+-]?|-->>?|--?\)|--?x)\s*[A-Za-z_][\w]*\s*:)(.*)$"
)


def rewrite_block(body: str) -> str:
    out = []
    for line in body.split("\n"):
        m = MSG.match(line)
        if m:
            out.append(m.group(1) + m.group(2).replace(";", ","))
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
    sys.stdout.write(sanitize(src))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
