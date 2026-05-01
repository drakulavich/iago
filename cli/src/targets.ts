// Resolves install directories per CLI agent.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { TARGETS } from "./types.ts";
import type { Options, Skill, SkillSelector, Target, TargetSelector } from "./types.ts";

// Resolve home dynamically so tests can override via $HOME without juggling
// node:os internals. Production behavior is unchanged: $HOME is always set on
// Unix; on Windows we fall back to homedir() (USERPROFILE).
function home(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? homedir();
}

export function targetDir(t: Target): string {
  const h = home();
  switch (t) {
    case "claude":  return join(h, ".claude", "skills");
    case "codex":   return join(h, ".agents", "skills");
    case "copilot": return join(h, ".copilot", "skills");
    case "gemini":  return join(h, ".gemini", "skills");
  }
}

/** Resolve --target/--skill-only into concrete lists. */
export function resolveSelection(
  opts: Pick<Options, "target" | "skillOnly">,
): { targets: readonly Target[]; skills: readonly Skill[]; createdDefault: boolean } {
  let targets: Target[];
  let createdDefault = false;

  if (opts.target === "all" || opts.target === "both") {
    targets = [...TARGETS];
  } else if (opts.target === "auto") {
    targets = TARGETS.filter((t) => existsSync(targetDir(t)));
    if (targets.length === 0) {
      // Fall back to creating ~/.claude/skills as the default landing pad.
      targets = ["claude"];
      createdDefault = true;
    }
  } else {
    targets = [opts.target];
  }

  const skills: Skill[] =
    opts.skillOnly === "both" ? ["iago", "squawk"] :
    opts.skillOnly === "iago" ? ["iago"] :
    ["squawk"];

  return { targets, skills, createdDefault };
}

export function skillSelectorIncludes(sel: SkillSelector, skill: Skill): boolean {
  if (sel === "both") return true;
  return sel === skill;
}

export function targetSelectorLabel(sel: TargetSelector): string {
  return sel;
}
