import { describe, expect, test } from "bun:test";
import { sanitize } from "../../iago/scripts/sanitize.ts";

describe("sanitize", () => {
  test("replaces ; with , in sequenceDiagram message labels", () => {
    const src = "```mermaid\nsequenceDiagram\n  A->>B: do x; then y\n```";
    expect(sanitize(src)).toContain("A->>B: do x, then y");
  });

  test("handles all arrow kinds (-->>, -), --x, with activation)", () => {
    const src = "```mermaid\nsequenceDiagram\n  A-->>B: a; b\n  C-)D: c; d\n  E--xF: e; f\n  G->>+H: g; h\n```";
    const out = sanitize(src);
    expect(out).toContain("a, b");
    expect(out).toContain("c, d");
    expect(out).toContain("e, f");
    expect(out).toContain("g, h");
  });

  test("leaves ; outside mermaid fences untouched", () => {
    const src = "prose with; a semicolon\n```mermaid\nflowchart TD\n  A-->B\n```";
    expect(sanitize(src)).toContain("prose with; a semicolon");
  });

  test("leaves flowchart node labels untouched", () => {
    const src = "```mermaid\nflowchart TD\n  A[do; thing] --> B\n```";
    expect(sanitize(src)).toContain("A[do; thing]");
  });

  test("leaves a non-mermaid fence completely untouched", () => {
    const src = "```js\nconst x = 1; const y = 2;\n```";
    expect(sanitize(src)).toBe(src);
  });

  test("quotes flowchart node labels starting with @", () => {
    const src = "```mermaid\nflowchart TD\n  M[a] -.-> N[@utils/utils -> antd locale]\n```";
    expect(sanitize(src)).toContain('N["@utils/utils -> antd locale"]');
  });

  test("leaves mid-label @ and already-quoted labels untouched", () => {
    const src =
      '```mermaid\nflowchart TD\n  A[imports from @utils/common] --> B["@i18n locale"]\n```';
    expect(sanitize(src)).toBe(src);
  });

  test("quotes leading-@ labels when %% comments precede the flowchart header", () => {
    const src =
      "```mermaid\n%%{init: {'theme': 'neutral'}}%%\n%% request path\nflowchart TD\n  M[a] --> N[@i18n locale]\n```";
    expect(sanitize(src)).toContain('N["@i18n locale"]');
  });

  test("leaves [@...] outside flowchart blocks untouched", () => {
    const src = "```mermaid\nsequenceDiagram\n  A->>B: load [@utils/common]\n```";
    expect(sanitize(src)).toBe(src);
  });

  test("preserves LF eol", () => {
    const src = "leading text\n```mermaid\n1\n2\n3\n```\ntrailing text";
    expect(sanitize(src)).toBe(src);
  });

  test("preserves CRLF eol", () => {
    const src = "leading text\r\n```mermaid\r\n1\r\n2\r\n3\r\n```\r\ntrailing text";
    expect(sanitize(src)).toBe(src);
  });

  test("rewrites a CRLF sequence message and keeps CRLF eol", () => {
    const src = "```mermaid\r\nsequenceDiagram\r\n  A->>B: load; then save\r\n```";
    const want = "```mermaid\r\nsequenceDiagram\r\n  A->>B: load, then save\r\n```";
    expect(sanitize(src)).toBe(want);
  });

  test("rewrites a CRLF flowchart [@...] label and keeps CRLF eol", () => {
    const src = "```mermaid\r\nflowchart TD\r\n  N[@i18n locale]\r\n```";
    const want = '```mermaid\r\nflowchart TD\r\n  N["@i18n locale"]\r\n```';
    expect(sanitize(src)).toBe(want);
  });

  test("quotes a rectangle label whose text contains square brackets", () => {
    const src = "```mermaid\nflowchart TD\n  G2P -- yes --> Vosk[return []]\n```";
    expect(sanitize(src)).toContain('Vosk["return []"]');
  });

  test("quotes a rectangle label with a non-empty nested index", () => {
    const src = "```mermaid\nflowchart TD\n  A[items arr[0]] --> B\n```";
    expect(sanitize(src)).toContain('A["items arr[0]"]');
  });

  test("leaves rectangle labels without inner brackets untouched", () => {
    const src = "```mermaid\nflowchart TD\n  A[normalize unicode] --> B[write stdout]\n```";
    expect(sanitize(src)).toBe(src);
  });

  test("leaves stadium, parallelogram, subroutine, cylinder, trapezoid shapes untouched", () => {
    const src =
      "```mermaid\nflowchart TD\n  S([read line]) --> E[/opus encode/]\n  E --> R[[run job]]\n  R --> D[(database)]\n  D --> T[/wide\\]\n```";
    expect(sanitize(src)).toBe(src);
  });

  test("leaves an already-quoted bracketed label untouched", () => {
    const src = '```mermaid\nflowchart TD\n  V["return []"] --> E\n```';
    expect(sanitize(src)).toBe(src);
  });

  test("does not re-quote bracketed text inside an existing quoted label", () => {
    const src = '```mermaid\nflowchart TD\n  A["call B[c[0]]"] --> E\n```';
    expect(sanitize(src)).toBe(src);
  });

  test("is idempotent on a nested-bracket label (second pass is a no-op)", () => {
    const src = "```mermaid\nflowchart TD\n  G2P -- yes --> Vosk[return []]\n```";
    const once = sanitize(src);
    expect(sanitize(once)).toBe(once);
  });

  test("leaves [] outside flowchart blocks untouched", () => {
    const src = "```mermaid\nsequenceDiagram\n  A->>B: returns []\n```";
    expect(sanitize(src)).toBe(src);
  });

  test("rewrites a CRLF nested-bracket label and keeps CRLF eol", () => {
    const src = "```mermaid\r\nflowchart TD\r\n  V[return []]\r\n```";
    const want = '```mermaid\r\nflowchart TD\r\n  V["return []"]\r\n```';
    expect(sanitize(src)).toBe(want);
  });

});
