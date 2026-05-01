// Argument parser — minimal, intentional, fully typed.
//
// Why hand-rolled and not commander/yargs:
//   - Cuts ~1MB of dependencies.
//   - We only have ~6 flags; framework overhead exceeds the win.
//   - Bun:test runs faster without big dep graph.

import { DEFAULT_REPO, SKILL_SELECTORS, TARGET_SELECTORS } from "./types.ts";
import type { Options, SkillSelector, TargetSelector } from "./types.ts";

export class ArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgError";
  }
}

const COMMANDS = ["install", "update", "uninstall", "doctor", "version", "help"] as const;
type Command = Options["command"];

export function parseArgs(argv: readonly string[]): Options {
  const opts: Options = {
    command: "help",
    target: "auto",
    version: "latest",
    skillOnly: "both",
    dryRun: false,
    force: false,
    repo: DEFAULT_REPO,
  };

  if (argv.length === 0) return opts;

  // First positional is the command.
  const first = argv[0]!;
  if (first.startsWith("-")) {
    throw new ArgError(`Expected a command (install, uninstall, doctor, version, help); got flag: ${first}`);
  }
  if (!(COMMANDS as readonly string[]).includes(first)) {
    throw new ArgError(`Unknown command: ${first}. Try: install, uninstall, doctor, version, help.`);
  }
  // "update" is just an alias for "install".
  opts.command = (first === "update" ? "install" : first) as Command;

  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i]!;
    const [keyRaw, ...valParts] = tok.split("=");
    const key = keyRaw!;
    const inline = valParts.length > 0 ? valParts.join("=") : undefined;

    const takeValue = (): string => {
      if (inline !== undefined) return inline;
      const next = rest[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new ArgError(`Flag ${key} requires a value`);
      }
      i++;
      return next;
    };

    switch (key) {
      case "--target": {
        const v = takeValue() as TargetSelector;
        if (!(TARGET_SELECTORS as readonly string[]).includes(v)) {
          throw new ArgError(`Invalid --target: ${v}. Must be one of: ${TARGET_SELECTORS.join(", ")}.`);
        }
        opts.target = v;
        break;
      }
      case "--version": {
        opts.version = takeValue();
        break;
      }
      case "--skill-only": {
        const v = takeValue() as SkillSelector;
        if (!(SKILL_SELECTORS as readonly string[]).includes(v)) {
          throw new ArgError(`Invalid --skill-only: ${v}. Must be one of: ${SKILL_SELECTORS.join(", ")}.`);
        }
        opts.skillOnly = v;
        break;
      }
      case "--repo": {
        opts.repo = takeValue();
        break;
      }
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--force":
        opts.force = true;
        break;
      case "-h":
      case "--help":
        opts.command = "help";
        break;
      default:
        throw new ArgError(`Unknown argument: ${tok}. Try --help.`);
    }
  }

  return opts;
}

export const HELP_TEXT = `\
iago — install / update Iago, a Greptile-style PR diagram skill.

Usage:
  iago <command> [options]

Commands:
  install              Install the skill files (also: update — alias).
  uninstall            Remove the skill files.
  doctor               Print install paths and detected versions.
  version              Print this CLI's version.
  help                 Show this message.

Install / uninstall options:
  --target=<sel>       claude | codex | copilot | gemini | both | all | auto
                       (default: auto — detect existing skill dirs)
  --version=<tag>      e.g. v0.1.1 (default: latest GitHub release)
  --skill-only=<sel>   iago | squawk | both (default: both)
  --dry-run            Print what would happen, change nothing.
  --force              Overwrite without confirmation; required when piped.
  --repo=<owner/name>  Override repo (default: drakulavich/iago).
  -h, --help           Show this message.

Examples:
  bunx @drakulavich/iago install                  # auto-detect, latest, prompts
  bunx @drakulavich/iago install --force          # quiet, no prompts
  bunx @drakulavich/iago install --version=v0.1.1
  bunx @drakulavich/iago install --target=both
  bunx @drakulavich/iago uninstall --target=claude
`;
