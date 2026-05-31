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
});
