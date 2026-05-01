// Shared types — keep these tight so refactors stay safe.

export const TARGETS = ["claude", "codex", "copilot", "gemini"] as const;
export type Target = (typeof TARGETS)[number];

export const SKILLS = ["iago", "squawk"] as const;
export type Skill = (typeof SKILLS)[number];

export const TARGET_SELECTORS = [...TARGETS, "auto", "all", "both"] as const;
export type TargetSelector = (typeof TARGET_SELECTORS)[number];

export const SKILL_SELECTORS = [...SKILLS, "both"] as const;
export type SkillSelector = (typeof SKILL_SELECTORS)[number];

export interface Options {
  command: "install" | "uninstall" | "doctor" | "version" | "help";
  target: TargetSelector;
  version: string;            // a tag, "latest", or "main"
  skillOnly: SkillSelector;
  dryRun: boolean;
  force: boolean;
  // Test hook: skip network, use this local path as the tarball.
  // Mirrors the IAGO_LOCAL_TARBALL env var on install.sh.
  localTarball?: string;
  // Override repo (for forks / mirrors).
  repo: string;
}

export const DEFAULT_REPO = "drakulavich/iago";
