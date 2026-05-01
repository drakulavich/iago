// Unit tests for target resolution.
//
// Most of the behavior is glue, but `resolveSelection` has real branching:
// auto-detect, fall-through to default, all/both expansion. Worth its own file.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSelection, targetDir } from "../src/targets.ts";

let originalHome: string | undefined;
let fakeHome: string;

beforeEach(() => {
  originalHome = process.env.HOME;
  fakeHome = mkdtempSync(join(tmpdir(), "iago-targets-"));
  process.env.HOME = fakeHome;
});

afterEach(() => {
  if (originalHome !== undefined) process.env.HOME = originalHome;
  else delete process.env.HOME;
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("targetDir", () => {
  test("returns ~/.claude/skills, ~/.agents/skills, etc.", () => {
    expect(targetDir("claude")).toBe(join(fakeHome, ".claude", "skills"));
    expect(targetDir("codex")).toBe(join(fakeHome, ".agents", "skills"));
    expect(targetDir("copilot")).toBe(join(fakeHome, ".copilot", "skills"));
    expect(targetDir("gemini")).toBe(join(fakeHome, ".gemini", "skills"));
    expect(targetDir("opencode")).toBe(
      join(fakeHome, ".config", "opencode", "skills"),
    );
  });
});

describe("resolveSelection", () => {
  test("explicit single target", () => {
    const r = resolveSelection({ target: "claude", skillOnly: "both" });
    expect(r.targets).toEqual(["claude"]);
    expect(r.skills).toEqual(["iago", "squawk"]);
    expect(r.createdDefault).toBe(false);
  });

  test("'both' / 'all' expand to every target", () => {
    const a = resolveSelection({ target: "both", skillOnly: "both" });
    const b = resolveSelection({ target: "all", skillOnly: "both" });
    expect(a.targets).toEqual(["claude", "codex", "copilot", "gemini", "opencode"]);
    expect(b.targets).toEqual(a.targets);
  });

  test("auto detects only existing dirs", () => {
    mkdirSync(join(fakeHome, ".claude", "skills"), { recursive: true });
    mkdirSync(join(fakeHome, ".gemini", "skills"), { recursive: true });
    const r = resolveSelection({ target: "auto", skillOnly: "both" });
    expect(r.targets).toEqual(["claude", "gemini"]);
    expect(r.createdDefault).toBe(false);
  });

  test("auto with no dirs falls back to claude + sets createdDefault", () => {
    const r = resolveSelection({ target: "auto", skillOnly: "both" });
    expect(r.targets).toEqual(["claude"]);
    expect(r.createdDefault).toBe(true);
  });

  test("--skill-only=iago narrows skills list", () => {
    expect(resolveSelection({ target: "claude", skillOnly: "iago" }).skills)
      .toEqual(["iago"]);
    expect(resolveSelection({ target: "claude", skillOnly: "squawk" }).skills)
      .toEqual(["squawk"]);
  });
});
