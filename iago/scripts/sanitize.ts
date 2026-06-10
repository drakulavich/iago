// Repair Mermaid syntax inside ```mermaid fences that GitHub's renderer rejects:
//  - sequenceDiagram message labels: replace ';' with ',' — GitHub's Mermaid
//    treats ';' as a statement separator, so a stray ';' truncates the line.
//  - flowchart/graph node labels: wrap unquoted labels starting with '@' in
//    double quotes — Mermaid >= 10.5 lexes '[@' as its edge-ID/shape syntax,
//    failing the whole diagram. (Incident: `N[@utils/utils -> ...]`.)
// Scope: only inside ```mermaid blocks. Never touches other fences or prose.

const FENCE = /(```mermaid\n)([\s\S]*?)(\n```)/g;
// Arrows: ->>, -->>, ->, -->, -), --), -x, --x, with optional +/- activation.
const MSG = /^(\s*[A-Za-z_]\w*\s*(?:->>?[+-]?|-->>?|--?\)|--?x)\s*[A-Za-z_]\w*\s*:)(.*)$/;
// Unquoted [@...] square-bracket labels; [^\]"] skips already-quoted ["@..."].
const LEADING_AT = /\[(@[^\]"]*)\]/g;

function rewriteBlock(body: string): string {
  const lines = body.split("\n");
  const first = lines.find((l) => l.trim() !== "")?.trim() ?? "";
  const isFlow = /^(flowchart|graph)\b/.test(first);
  return lines
    .map((line) => {
      if (isFlow) return line.replace(LEADING_AT, '["$1"]');
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
