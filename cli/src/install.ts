// Install / uninstall — the heart of the CLI.
//
// Atomicity strategy: copy source to a sibling staging dir, then mv staging
// over the target after backing up the existing dir. On any failure, restore
// the backup. This minimizes the inconsistent window to one rename(2).

import {
  cpSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { resolveSelection, targetDir } from "./targets.ts";
import type { Options, Skill, Target } from "./types.ts";

export class InstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallError";
  }
}

export interface InstallPlan {
  targets: readonly Target[];
  skills: readonly Skill[];
  willOverwrite: string[];
  createdDefault: boolean;
}

export function planInstall(
  opts: Pick<Options, "target" | "skillOnly">,
): InstallPlan {
  const { targets, skills, createdDefault } = resolveSelection(opts);
  const willOverwrite: string[] = [];
  for (const t of targets) {
    const base = targetDir(t);
    for (const s of skills) {
      const final = join(base, s);
      if (existsSync(final)) willOverwrite.push(final);
    }
  }
  return { targets, skills, willOverwrite, createdDefault };
}

export interface InstallParams {
  /** Where the extracted source root lives (must contain `iago/` and/or `squawk/`). */
  sourceRoot: string;
  /** Tag or branch label that gets written into `.iago-version`. */
  version: string;
  plan: InstallPlan;
  dryRun: boolean;
  /** Reporter. Pass console.log in production, a buffer in tests. */
  log?: (line: string) => void;
}

export function performInstall(p: InstallParams): { installed: string[] } {
  const log = p.log ?? (() => {});
  const installed: string[] = [];

  // Validate source has all selected skills.
  for (const skill of p.plan.skills) {
    const skillSrc = join(p.sourceRoot, skill);
    if (!existsSync(skillSrc) || !statSync(skillSrc).isDirectory()) {
      throw new InstallError(`Source missing ${skill}/ in extracted tarball at ${p.sourceRoot}`);
    }
    const skillFile = join(skillSrc, "SKILL.md");
    if (!existsSync(skillFile)) {
      throw new InstallError(`Source missing ${skill}/SKILL.md in extracted tarball`);
    }
  }

  for (const target of p.plan.targets) {
    const base = targetDir(target);
    log(`→ Target: ${target} (${base})`);
    if (!p.dryRun) mkdirSync(base, { recursive: true });

    for (const skill of p.plan.skills) {
      const src = join(p.sourceRoot, skill);
      const final = join(base, skill);

      if (p.dryRun) {
        log(`  would install ${src} -> ${final}`);
        continue;
      }

      installAtomic({ src, final });
      writeFileSync(join(final, ".iago-version"), `${p.version}\n`);
      log(`  ✓ installed ${skill} -> ${final}`);
      installed.push(final);
    }
  }
  return { installed };
}

function installAtomic({ src, final }: { src: string; final: string }): void {
  const parent = dirname(final);
  // Use process.pid to avoid collisions when multiple concurrent installs happen.
  const tag = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const staging = join(parent, `.iago-staging-${tag}`);
  const backup = join(parent, `.iago-backup-${tag}`);

  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  cpSync(src, staging, { recursive: true });

  let backupCreated = false;
  if (existsSync(final)) {
    renameSync(final, backup);
    backupCreated = true;
  }

  try {
    renameSync(staging, final);
  } catch (err) {
    // Roll back.
    if (backupCreated && existsSync(backup)) renameSync(backup, final);
    rmSync(staging, { recursive: true, force: true });
    throw new InstallError(`Failed to install into ${final}: ${(err as Error).message}`);
  }

  if (backupCreated) rmSync(backup, { recursive: true, force: true });
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  if (i === -1) return ".";
  if (i === 0) return "/";
  return p.slice(0, i);
}

export interface UninstallParams {
  plan: Pick<InstallPlan, "targets" | "skills">;
  dryRun: boolean;
  log?: (line: string) => void;
}

/** Returns count of removed dirs. */
export function performUninstall(p: UninstallParams): number {
  const log = p.log ?? (() => {});
  let removed = 0;
  for (const target of p.plan.targets) {
    const base = targetDir(target);
    if (!existsSync(base)) {
      log(`  skip ${target} (no ${base})`);
      continue;
    }
    for (const skill of p.plan.skills) {
      const path = join(base, skill);
      if (existsSync(path)) {
        if (p.dryRun) {
          log(`  would remove ${path}`);
        } else {
          rmSync(path, { recursive: true, force: true });
          log(`  ✓ removed ${path}`);
        }
        removed++;
      }
    }
  }
  return removed;
}
