// Parse-validate Mermaid sources with the real mermaid parser, the same one
// GitHub runs. mermaid requires a DOM, so jsdom globals must be installed
// before the (dynamic, memoized) import.
//
// Known limitation: window/document/navigator stay installed on globalThis for
// the rest of the worker's lifetime — no cleanup. The memoized mermaid instance
// touches them lazily on every parse(), so restoring the globals mid-suite
// would break later calls. Don't import this helper from tests that assert a
// non-browser environment.
import { JSDOM } from "jsdom";

let mermaidPromise: Promise<typeof import("mermaid").default> | undefined;

function loadMermaid(): Promise<typeof import("mermaid").default> {
  mermaidPromise ??= (async () => {
    const dom = new JSDOM("<!DOCTYPE html><body></body>");
    const g = globalThis as Record<string, unknown>;
    g["window"] = dom.window;
    g["document"] = dom.window.document;
    g["navigator"] = dom.window.navigator;
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false });
    return mermaid;
  })();
  return mermaidPromise;
}

/** Throws (with mermaid's parse error message) if `src` is not valid Mermaid. */
export async function parseMermaid(src: string): Promise<void> {
  const mermaid = await loadMermaid();
  await mermaid.parse(src);
}

/** Bodies of all ```mermaid fences in a markdown document (same fence shape as sanitize.ts). */
export function extractMermaidBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```mermaid\n([\s\S]*?)\n```/g)].map((m) => m[1] ?? "");
}
