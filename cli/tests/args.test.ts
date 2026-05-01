// Unit tests for the argument parser.
//
// Philosophy (Kent C. Dodds): test behavior, not implementation. We assert on
// the parsed Options shape — not on internal state. The parser is small and
// pure, so unit-level coverage is the right level here.

import { describe, expect, test } from "bun:test";
import { ArgError, HELP_TEXT, parseArgs } from "../src/args.ts";

describe("parseArgs", () => {
  test("no args -> help command with defaults", () => {
    const o = parseArgs([]);
    expect(o.command).toBe("help");
    expect(o.target).toBe("auto");
    expect(o.skillOnly).toBe("both");
    expect(o.version).toBe("latest");
    expect(o.dryRun).toBe(false);
    expect(o.force).toBe(false);
    expect(o.repo).toBe("drakulavich/iago");
  });

  test("install with explicit flags using = form", () => {
    const o = parseArgs([
      "install",
      "--target=claude",
      "--skill-only=iago",
      "--version=v0.1.1",
      "--dry-run",
      "--force",
    ]);
    expect(o.command).toBe("install");
    expect(o.target).toBe("claude");
    expect(o.skillOnly).toBe("iago");
    expect(o.version).toBe("v0.1.1");
    expect(o.dryRun).toBe(true);
    expect(o.force).toBe(true);
  });

  test("install with space-separated flag values", () => {
    const o = parseArgs(["install", "--target", "codex", "--version", "main"]);
    expect(o.target).toBe("codex");
    expect(o.version).toBe("main");
  });

  test("update is an alias for install", () => {
    const o = parseArgs(["update"]);
    expect(o.command).toBe("install");
  });

  test("uninstall command parses target", () => {
    const o = parseArgs(["uninstall", "--target=both"]);
    expect(o.command).toBe("uninstall");
    expect(o.target).toBe("both");
  });

  test("doctor and version commands", () => {
    expect(parseArgs(["doctor"]).command).toBe("doctor");
    expect(parseArgs(["version"]).command).toBe("version");
  });

  test("--help anywhere flips command to help", () => {
    expect(parseArgs(["install", "--help"]).command).toBe("help");
    expect(parseArgs(["install", "-h"]).command).toBe("help");
  });

  test("custom --repo override", () => {
    const o = parseArgs(["install", "--repo=acme/fork"]);
    expect(o.repo).toBe("acme/fork");
  });

  test("rejects unknown command", () => {
    expect(() => parseArgs(["nuke"])).toThrow(ArgError);
  });

  test("rejects flag in command position", () => {
    expect(() => parseArgs(["--target=claude"])).toThrow(/Expected a command/);
  });

  test("rejects invalid --target value", () => {
    expect(() => parseArgs(["install", "--target=vscode"])).toThrow(
      /Invalid --target/,
    );
  });

  test("rejects invalid --skill-only value", () => {
    expect(() => parseArgs(["install", "--skill-only=parrot"])).toThrow(
      /Invalid --skill-only/,
    );
  });

  test("rejects unknown flag", () => {
    expect(() => parseArgs(["install", "--turbo"])).toThrow(/Unknown argument/);
  });

  test("rejects flag missing required value", () => {
    expect(() => parseArgs(["install", "--target"])).toThrow(/requires a value/);
    // Next token is another flag, also invalid.
    expect(() => parseArgs(["install", "--version", "--force"])).toThrow(
      /requires a value/,
    );
  });

  test("HELP_TEXT mentions all the things a user types", () => {
    // Sanity: the help string is what we ship; if it loses a flag name, users
    // will reach for it and not find it.
    for (const needle of [
      "install",
      "uninstall",
      "doctor",
      "--target",
      "--skill-only",
      "--dry-run",
      "--force",
      "bunx @drakulavich/iago",
    ]) {
      expect(HELP_TEXT).toContain(needle);
    }
  });
});
