import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sanitize } from "../../iago/scripts/sanitize.ts";
import { extractMermaidBlocks, parseMermaid } from "./helpers/mermaid.ts";

const FIXTURES = join(import.meta.dir, "fixtures", "mermaid");
const REPO_ROOT = join(import.meta.dir, "..", "..");

const fence = (body: string) => "```mermaid\n" + body + "\n```";

// Regression corpus: every field rendering incident lands here verbatim.
// valid/   — must parse as-is.
// invalid/ — must fail parse as-is, and parse after sanitize() repairs it.
describe("mermaid fixtures", () => {
  for (const file of readdirSync(join(FIXTURES, "valid"))) {
    test(`valid/${file} parses`, async () => {
      await parseMermaid(readFileSync(join(FIXTURES, "valid", file), "utf8"));
    });
  }

  for (const file of readdirSync(join(FIXTURES, "invalid"))) {
    const src = readFileSync(join(FIXTURES, "invalid", file), "utf8");

    test(`invalid/${file} fails to parse`, async () => {
      await expect(parseMermaid(src)).rejects.toThrow();
    });

    test(`invalid/${file} parses after sanitize()`, async () => {
      const repaired = extractMermaidBlocks(sanitize(fence(src)));
      expect(repaired).toHaveLength(1);
      await parseMermaid(repaired[0] ?? "");
    });
  }
});

describe("repo docs mermaid blocks", () => {
  const docs = [
    "iago/examples/sequence.md",
    "iago/examples/flow.md",
    "iago/examples/class.md",
    "iago/examples/er.md",
    "iago/references/mermaid-templates.md",
    "README.md",
  ];

  for (const doc of docs) {
    test(`${doc} parses`, async () => {
      const blocks = extractMermaidBlocks(readFileSync(join(REPO_ROOT, doc), "utf8")).filter(
        // the output-wrapping example in mermaid-templates.md holds a literal placeholder
        (block) => !block.includes("<diagram body>"),
      );
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) await parseMermaid(block);
    });
  }
});
