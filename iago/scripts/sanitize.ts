// Replace ';' with ',' in sequenceDiagram message labels inside ```mermaid fences.
// GitHub's Mermaid treats ';' as a statement separator, so a stray ';' in a
// message label truncates the line. Scope: only inside ```mermaid blocks, only
// on `<participant><arrow><participant>: <text>` lines. Never touches
// flowchart/class/er bodies, notes, participants, or prose.

const FENCE = /(```mermaid\n)([\s\S]*?)(\n```)/g;
// Arrows: ->>, -->>, ->, -->, -), --), -x, --x, with optional +/- activation.
const MSG = /^(\s*[A-Za-z_]\w*\s*(?:->>?[+-]?|-->>?|--?\)|--?x)\s*[A-Za-z_]\w*\s*:)(.*)$/;

function rewriteBlock(body: string): string {
  return body
    .split("\n")
    .map((line) => {
      const m = MSG.exec(line);
      if (!m) return line;
      const head = m[1] ?? "";
      const rest = m[2] ?? "";
      return head + rest.replace(/;/g, ",");
    })
    .join("\n");
}

export function sanitize(src: string): string {
  return src.replace(
    FENCE,
    (_full, open: string, body: string, close: string) => open + rewriteBlock(body) + close,
  );
}
