// Repair Mermaid syntax inside ```mermaid fences that GitHub's renderer rejects:
//  - sequenceDiagram message labels: replace ';' with ',' — GitHub's Mermaid
//    treats ';' as a statement separator, so a stray ';' truncates the line.
//  - flowchart/graph node labels: wrap unquoted labels starting with '@' in
//    double quotes — Mermaid >= 10.5 lexes '[@' as its edge-ID/shape syntax,
//    failing the whole diagram. (Incident: `N[@utils/utils -> ...]`.)
//  - flowchart/graph rectangle labels containing a nested '[' — the lexer reads
//    the inner '[' as a new shape token and aborts. Quote them so the brackets
//    become literal text. (Incident: `Vosk[return []]`, issue #21.)
// Scope: only inside ```mermaid blocks. Never touches other fences or prose.

const FENCE = /(```mermaid\r?\n)([\s\S]*?)(\r?\n```)/g;
// Arrows: ->>, -->>, ->, -->, -), --), -x, --x, with optional +/- activation.
const MSG = /^(\s*[A-Za-z_]\w*\s*(?:->>?[+-]?|-->>?|--?\)|--?x)\s*[A-Za-z_]\w*\s*:)(.*)$/;
// Unquoted [@...] square-bracket labels; [^\]"] skips already-quoted ["@..."].
const LEADING_AT = /\[(@[^\]"]*)\]/g;
// Other shapes open with a second char after '['; never treat them as a plain
// rectangle: [[ subroutine, [( cylinder, [/ and [\ parallelogram/trapezoid.
const SHAPE_SECOND_CHARS = new Set(["[", "(", "/", "\\"]);

// Quote rectangle labels `id[text]` whose text contains a square bracket. A
// nested '[' otherwise re-enters shape lexing and fails the whole diagram.
// Scans for the balanced closing ']' so nested brackets are handled, and skips
// non-rectangle shapes (stadium/cylinder/parallelogram/subroutine) and labels
// that are already quoted.
function quoteBracketedLabels(line: string): string {
  let out = "";
  let i = 0;
  let inQuote = false; // inside a "..." label; brackets there are already literal
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    const prev = line[i - 1];
    const next = line[i + 1];
    // A rectangle opener: '[' right after an identifier char, not inside an
    // existing quoted label, not a known shape opener, not already quoted ('["').
    const isRectOpen =
      ch === "[" &&
      !inQuote &&
      prev !== undefined &&
      /\w/.test(prev) &&
      next !== undefined &&
      next !== '"' &&
      !SHAPE_SECOND_CHARS.has(next);
    if (!isRectOpen) {
      out += ch;
      i += 1;
      continue;
    }
    // Walk to the balanced closing ']', tracking nested '[' depth.
    let depth = 0;
    let j = i;
    for (; j < line.length; j += 1) {
      if (line[j] === "[") depth += 1;
      else if (line[j] === "]") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const inner = line.slice(i + 1, j);
    // Quote only when the label actually contains a bracket and is safe to wrap
    // (no embedded quote that would break the wrapping). A label whose brackets
    // never balance (depth !== 0) is left as-is: it is genuinely malformed and
    // emitting it unchanged is safer than guessing where the label ends.
    if (depth === 0 && /[[\]]/.test(inner) && !inner.includes('"')) {
      out += `["${inner}"]`;
      i = j + 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

function rewriteBlock(body: string): string {
  const lines = body.split(/\r?\n/);
  // Skip blank lines and %% comments/directives (e.g. %%{init: ...}%%) to find the header.
  const first = lines.find((l) => l.trim() !== "" && !l.trim().startsWith("%%"))?.trim() ?? "";
  const isFlow = /^(flowchart|graph)\b/.test(first);
  const eol = /\r\n/.test(body) ? "\r\n" : "\n";
  return lines
    .map((line) => {
      if (isFlow) return quoteBracketedLabels(line).replace(LEADING_AT, '["$1"]');
      const m = MSG.exec(line);
      if (!m) return line;
      const head = m[1] ?? "";
      const rest = m[2] ?? "";
      return head + rest.replace(/;/g, ",");
    })
    .join(eol);
}

export function sanitize(src: string): string {
  return src.replace(
    FENCE,
    (_full, open: string, body: string, close: string) => open + rewriteBlock(body) + close,
  );
}
