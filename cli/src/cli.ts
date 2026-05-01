#!/usr/bin/env node
//
// Iago CLI entrypoint. Stays thin — delegates to args/install/tarball.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArgError, HELP_TEXT, parseArgs } from "./args.ts";
import { performInstall, performUninstall, planInstall } from "./install.ts";
import { fetchAndExtract, resolveLatestTag, TarballError } from "./tarball.ts";
import { targetDir } from "./targets.ts";
import { TARGETS } from "./types.ts";

// Read package.json at runtime so the version string stays in sync with npm.
function readPackageVersion(): string {
  const here = (import.meta as { dir?: string }).dir ?? new URL(".", import.meta.url).pathname;
  const candidates = [
    join(here, "..", "package.json"),
    join(here, "package.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, "utf8");
      const json = JSON.parse(raw) as { version?: string };
      if (json.version) return json.version;
    } catch {/* try next */}
  }
  return "0.0.0-dev";
}

async function main(argv: readonly string[]): Promise<number> {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    if (err instanceof ArgError) {
      console.error(`✗ ${err.message}\n`);
      console.error(HELP_TEXT);
      return 2;
    }
    throw err;
  }

  switch (opts.command) {
    case "help":
      console.log(HELP_TEXT);
      return 0;
    case "version":
      console.log(readPackageVersion());
      return 0;
    case "doctor":
      return doctor();
    case "install":
      return await runInstall(opts);
    case "uninstall":
      return runUninstall(opts);
  }
}

function doctor(): number {
  console.log(`iago CLI v${readPackageVersion()}`);
  console.log("Install paths:");
  for (const t of TARGETS) {
    const dir = targetDir(t);
    const exists = existsSync(dir);
    console.log(`  ${t.padEnd(8)} ${exists ? "✓" : "·"} ${dir}`);
    if (exists) {
      for (const skill of ["iago", "squawk"] as const) {
        const path = join(dir, skill);
        if (existsSync(path)) {
          let ver = "(no marker)";
          try { ver = readFileSync(join(path, ".iago-version"), "utf8").trim(); } catch {/* ignore */}
          console.log(`    └─ ${skill}: ${ver}`);
        }
      }
    }
  }
  return 0;
}

async function runInstall(opts: ReturnType<typeof parseArgs>): Promise<number> {
  // Resolve version eagerly so logs and the marker are accurate.
  let version = opts.version;
  const localTarball = process.env.IAGO_LOCAL_TARBALL || opts.localTarball;
  if (version === "latest") {
    if (localTarball) {
      // In test mode we keep "latest" as a literal label rather than hitting the API.
      version = "latest";
    } else {
      try {
        version = await resolveLatestTag(opts.repo);
      } catch (err) {
        console.error(`! Could not resolve latest tag (${(err as Error).message}). Falling back to 'main'.`);
        version = "main";
      }
    }
  }

  const plan = planInstall(opts);
  if (plan.createdDefault) {
    console.log("→ No skills directory found; defaulting to ~/.claude/skills.");
  }

  // Overwrite-safety: in non-tty (piped) sessions, require --force.
  if (plan.willOverwrite.length > 0 && !opts.force && !opts.dryRun) {
    if (!process.stdin.isTTY) {
      console.error(
        "! The following will be replaced:\n" +
        plan.willOverwrite.map((p) => `  ${p}`).join("\n") +
        "\n✗ Refusing to overwrite without --force in non-interactive mode."
      );
      return 1;
    }
    const ans = await prompt(`Overwrite ${plan.willOverwrite.length} existing path(s)? [y/N] `);
    if (!/^[yY]$/.test(ans.trim())) {
      console.error("Aborted.");
      return 1;
    }
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "iagoinst-"));
  try {
    const sourceRoot = await fetchAndExtract(
      {
        repo: opts.repo,
        ref: version,
        isBranch: version === "main",
        ...(localTarball ? { localPath: localTarball } : {}),
      },
      tmpDir,
    );

    console.log(`→ Installing iago ${version} from ${opts.repo}`);
    performInstall({
      sourceRoot,
      version,
      plan,
      dryRun: opts.dryRun,
      log: (line) => console.log(line),
    });
    console.log(`✓ iago ${version} ready.`);
    return 0;
  } catch (err) {
    if (err instanceof TarballError) {
      console.error(`✗ ${err.message}`);
      return 1;
    }
    throw err;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function runUninstall(opts: ReturnType<typeof parseArgs>): number {
  const plan = planInstall(opts);
  console.log(`→ Uninstalling iago from: ${plan.targets.join(", ")}`);
  const removed = performUninstall({
    plan,
    dryRun: opts.dryRun,
    log: (line) => console.log(line),
  });
  if (removed === 0) console.log("! Nothing to uninstall.");
  return 0;
}

function prompt(message: string): Promise<string> {
  process.stdout.write(message);
  return new Promise((resolve) => {
    let buf = "";
    const onData = (chunk: Buffer): void => {
      const s = chunk.toString();
      buf += s;
      if (s.includes("\n")) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(buf);
      }
    };
    process.stdin.on("data", onData);
    process.stdin.resume();
  });
}

// Ensure tmp dir hint is touched so the linter doesn't whine.
mkdirSync; // eslint-disable-line @typescript-eslint/no-unused-expressions

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    console.error(`✗ Unexpected error: ${(err as Error).stack ?? err}`);
    process.exit(1);
  },
);
