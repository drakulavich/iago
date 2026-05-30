// Reads JSON `[{id, src}, ...]` from stdin, validates each with mermaid.parse()
// (parse-only — no headless browser). Writes `{"failures":[{id,error}]}` to
// stdout. Exit 0 if all parse, 1 if any fail, 2 on internal error.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><body></body>", { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// navigator is a read-only getter on globalThis in Node 26+; use defineProperty
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  writable: true,
  configurable: true,
});

const mermaid = (await import("mermaid")).default;
mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
let cases;
try {
  cases = JSON.parse(Buffer.concat(chunks).toString() || "[]");
} catch (e) {
  process.stderr.write(`bad input json: ${e}`);
  process.exit(2);
}

const failures = [];
for (const { id, src } of cases) {
  try {
    await mermaid.parse(src);
  } catch (e) {
    failures.push({ id, error: String(e && e.message ? e.message : e) });
  }
}
process.stdout.write(JSON.stringify({ failures }));
process.exit(failures.length ? 1 : 0);
