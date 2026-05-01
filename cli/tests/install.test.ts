// Integration tests — the heart of the suite.
//
// Philosophy (Martin Fowler / Kent C. Dodds): exercise the CLI through its
// real interface (subprocess invocation) using a real temp filesystem and a
// real fake tarball. We assert on observable outcomes — files created, exit
// codes, stdout — not on internal calls. This mirrors the bats coverage so
// both channels (install.sh and bunx @drakulavich/iago) stay in lockstep.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performInstall, planInstall } from "../src/install.ts";
import { buildFakeTarball } from "../src/tarball.ts";

const CLI_ENTRY = join(import.meta.dir, "..", "src", "cli.ts");
const FAKE_VERSION = "v9.9.9";

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

let scratch: string;
let fakeHome: string;
let tarballPath: string;
let originalHome: string | undefined;

async function runCli(
  args: readonly string[],
  envOverride: Record<string, string> = {},
): Promise<RunResult> {
  const proc = Bun.spawn(["bun", "run", CLI_ENTRY, ...args], {
    env: {
      ...process.env,
      HOME: fakeHome,
      IAGO_LOCAL_TARBALL: tarballPath,
      ...envOverride,
    },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { code: proc.exitCode ?? -1, stdout, stderr };
}

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), "iago-itest-"));
  fakeHome = join(scratch, "home");
  mkdirSync(fakeHome, { recursive: true });
  tarballPath = join(scratch, "fake.tar.gz");
  const tarScratch = join(scratch, "tar-build");
  mkdirSync(tarScratch, { recursive: true });
  await buildFakeTarball(tarballPath, FAKE_VERSION.replace(/^v/, ""), tarScratch);
  originalHome = process.env.HOME;
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
  if (originalHome !== undefined) process.env.HOME = originalHome;
});

// ---------- Subprocess integration tests (mirror bats coverage) ----------

describe("CLI subprocess: install", () => {
  test("install --target=claude --force creates skills and version markers", async () => {
    const r = await runCli(["install", "--target=claude", "--force"]);
    expect(r.code).toBe(0);
    const claudeBase = join(fakeHome, ".claude", "skills");
    expect(existsSync(join(claudeBase, "iago", "SKILL.md"))).toBe(true);
    expect(existsSync(join(claudeBase, "squawk", "SKILL.md"))).toBe(true);
    expect(readFileSync(join(claudeBase, "iago", ".iago-version"), "utf8").trim())
      .toBe("latest");
  });

  test("install is idempotent — second run with --force succeeds", async () => {
    const a = await runCli(["install", "--target=claude", "--force"]);
    expect(a.code).toBe(0);
    const b = await runCli(["install", "--target=claude", "--force"]);
    expect(b.code).toBe(0);
    // Marker still readable; skill still present.
    const ver = readFileSync(
      join(fakeHome, ".claude", "skills", "iago", ".iago-version"),
      "utf8",
    ).trim();
    expect(ver).toBe("latest");
  });

  test("--skill-only=iago installs only iago", async () => {
    const r = await runCli([
      "install",
      "--target=claude",
      "--skill-only=iago",
      "--force",
    ]);
    expect(r.code).toBe(0);
    const base = join(fakeHome, ".claude", "skills");
    expect(existsSync(join(base, "iago"))).toBe(true);
    expect(existsSync(join(base, "squawk"))).toBe(false);
  });

  test("--target=both installs into all four agent dirs", async () => {
    const r = await runCli(["install", "--target=both", "--force"]);
    expect(r.code).toBe(0);
    for (const [dir, sub] of [
      [".claude", "skills"],
      [".agents", "skills"],
      [".copilot", "skills"],
      [".gemini", "skills"],
    ] as const) {
      expect(existsSync(join(fakeHome, dir, sub, "iago", "SKILL.md"))).toBe(true);
    }
  });

  test("auto-detect picks up only existing dirs", async () => {
    // Pre-create only .codex and .gemini.
    mkdirSync(join(fakeHome, ".agents", "skills"), { recursive: true });
    mkdirSync(join(fakeHome, ".gemini", "skills"), { recursive: true });
    const r = await runCli(["install", "--force"]); // auto is default
    expect(r.code).toBe(0);
    expect(existsSync(join(fakeHome, ".agents", "skills", "iago"))).toBe(true);
    expect(existsSync(join(fakeHome, ".gemini", "skills", "iago"))).toBe(true);
    expect(existsSync(join(fakeHome, ".claude", "skills", "iago"))).toBe(false);
    expect(existsSync(join(fakeHome, ".copilot", "skills", "iago"))).toBe(false);
  });

  test("auto with no skill dirs falls back to ~/.claude/skills", async () => {
    const r = await runCli(["install", "--force"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("defaulting to ~/.claude/skills");
    expect(existsSync(join(fakeHome, ".claude", "skills", "iago"))).toBe(true);
  });

  test("--dry-run changes nothing on disk", async () => {
    const r = await runCli([
      "install",
      "--target=claude",
      "--dry-run",
      "--force",
    ]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/would install/);
    expect(existsSync(join(fakeHome, ".claude", "skills", "iago"))).toBe(false);
  });

  test("non-tty install refuses to overwrite without --force", async () => {
    // First install plants the dir.
    const a = await runCli(["install", "--target=claude", "--force"]);
    expect(a.code).toBe(0);
    // Second install without --force, no TTY → refuse.
    const b = await runCli(["install", "--target=claude"]);
    expect(b.code).toBe(1);
    expect(b.stderr).toContain("Refusing to overwrite without --force");
  });

  test("doctor lists install paths", async () => {
    await runCli(["install", "--target=claude", "--force"]);
    const r = await runCli(["doctor"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("iago CLI v");
    expect(r.stdout).toContain(join(fakeHome, ".claude", "skills"));
    expect(r.stdout).toContain("iago: latest");
  });

  test("invalid flag exits with code 2 and prints help", async () => {
    const r = await runCli(["install", "--turbo"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Unknown argument");
    expect(r.stderr).toContain("Usage:");
  });

  test("missing local tarball exits 1 with TarballError", async () => {
    const r = await runCli(
      ["install", "--target=claude", "--force"],
      { IAGO_LOCAL_TARBALL: join(scratch, "does-not-exist.tar.gz") },
    );
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("Local tarball not found");
  });
});

describe("CLI subprocess: uninstall", () => {
  test("removes installed skills", async () => {
    await runCli(["install", "--target=claude", "--force"]);
    const r = await runCli(["uninstall", "--target=claude"]);
    expect(r.code).toBe(0);
    const base = join(fakeHome, ".claude", "skills");
    expect(existsSync(join(base, "iago"))).toBe(false);
    expect(existsSync(join(base, "squawk"))).toBe(false);
  });

  test("uninstall on a clean machine reports 'nothing to uninstall'", async () => {
    const r = await runCli(["uninstall", "--target=claude"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Nothing to uninstall");
  });
});

// ---------- Direct unit tests for the install module ----------

describe("performInstall (direct)", () => {
  // We use a fresh extracted source tree per test, mirroring what tarball.ts
  // would produce. Faster than full subprocess; keeps the suite snappy.
  function makeSourceRoot(): string {
    const root = join(scratch, "extracted");
    mkdirSync(join(root, "iago"), { recursive: true });
    mkdirSync(join(root, "squawk"), { recursive: true });
    writeFileSync(join(root, "iago", "SKILL.md"), "# test iago\n");
    writeFileSync(join(root, "squawk", "SKILL.md"), "# test squawk\n");
    return root;
  }

  test("planInstall reports no overwrites on a clean target", () => {
    process.env.HOME = fakeHome;
    const plan = planInstall({ target: "claude", skillOnly: "both" });
    expect(plan.targets).toEqual(["claude"]);
    expect(plan.willOverwrite).toEqual([]);
  });

  test("planInstall lists existing dirs as willOverwrite", () => {
    process.env.HOME = fakeHome;
    mkdirSync(join(fakeHome, ".claude", "skills", "iago"), { recursive: true });
    const plan = planInstall({ target: "claude", skillOnly: "both" });
    expect(plan.willOverwrite).toContain(
      join(fakeHome, ".claude", "skills", "iago"),
    );
  });

  test("performInstall writes files atomically and stamps version marker", () => {
    process.env.HOME = fakeHome;
    const root = makeSourceRoot();
    const plan = planInstall({ target: "claude", skillOnly: "both" });
    performInstall({ sourceRoot: root, version: "v0.1.1", plan, dryRun: false });
    const skillFile = join(fakeHome, ".claude", "skills", "iago", "SKILL.md");
    expect(readFileSync(skillFile, "utf8")).toContain("test iago");
    expect(readFileSync(
      join(fakeHome, ".claude", "skills", "iago", ".iago-version"),
      "utf8",
    ).trim()).toBe("v0.1.1");
  });

  test("performInstall throws when source is missing a skill dir", () => {
    process.env.HOME = fakeHome;
    const root = join(scratch, "broken");
    mkdirSync(root, { recursive: true });
    // No iago/, no squawk/.
    const plan = planInstall({ target: "claude", skillOnly: "both" });
    expect(() =>
      performInstall({ sourceRoot: root, version: "v1", plan, dryRun: false }),
    ).toThrow(/Source missing/);
  });

  test("performInstall replaces existing dir without leaving staging artifacts", () => {
    process.env.HOME = fakeHome;
    const claudeBase = join(fakeHome, ".claude", "skills");
    mkdirSync(join(claudeBase, "iago"), { recursive: true });
    writeFileSync(join(claudeBase, "iago", "OLD.md"), "old content\n");
    const root = makeSourceRoot();
    const plan = planInstall({ target: "claude", skillOnly: "both" });
    performInstall({ sourceRoot: root, version: "v1", plan, dryRun: false });
    // OLD.md is gone, SKILL.md is fresh.
    expect(existsSync(join(claudeBase, "iago", "OLD.md"))).toBe(false);
    expect(existsSync(join(claudeBase, "iago", "SKILL.md"))).toBe(true);
    // No leftover staging or backup directories at the parent level.
    const leftovers = require("node:fs").readdirSync(claudeBase) as string[];
    for (const name of leftovers) {
      expect(name.startsWith(".iago-staging-")).toBe(false);
      expect(name.startsWith(".iago-backup-")).toBe(false);
    }
  });

  test("dry-run leaves the filesystem untouched", () => {
    process.env.HOME = fakeHome;
    const root = makeSourceRoot();
    const plan = planInstall({ target: "claude", skillOnly: "both" });
    performInstall({ sourceRoot: root, version: "v1", plan, dryRun: true });
    expect(existsSync(join(fakeHome, ".claude", "skills", "iago"))).toBe(false);
  });
});

// ---------- Sanity check: the fake tarball helper ----------

describe("buildFakeTarball helper", () => {
  test("produces a tar.gz that extracts into iago-<version>/{iago,squawk}", async () => {
    const out = join(scratch, "helper.tar.gz");
    const work = join(scratch, "helper-work");
    mkdirSync(work, { recursive: true });
    await buildFakeTarball(out, "9.9.9", work);
    expect(statSync(out).size).toBeGreaterThan(0);
    // Extract it and verify shape.
    const dest = join(scratch, "helper-extract");
    mkdirSync(dest, { recursive: true });
    const proc = Bun.spawn(["tar", "-xzf", out, "-C", dest]);
    await proc.exited;
    expect(proc.exitCode).toBe(0);
    expect(existsSync(join(dest, "iago-9.9.9", "iago", "SKILL.md"))).toBe(true);
    expect(existsSync(join(dest, "iago-9.9.9", "squawk", "SKILL.md"))).toBe(true);
  });
});
