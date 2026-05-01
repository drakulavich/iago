# @drakulavich/iago

> 🦜 Install / update **[Iago](https://github.com/drakulavich/iago)** — a Greptile-style PR-diagram skill for Claude Code, Codex CLI, Copilot, and Gemini.

Zero-dependency, fully typed, runs anywhere Node ≥18 or Bun runs.

## Quick start

```bash
bunx @drakulavich/iago install --force      # auto-detects which agent dirs you have
npx  @drakulavich/iago install --force      # same, via npm
```

That's it. Re-run later to update.

## Commands

```bash
iago install                          # auto-detect agent, prompt before overwriting
iago install --force                  # quiet, no prompts (good for piping / CI)
iago install --target=both            # install into Claude + Codex + Copilot + Gemini
iago install --target=claude          # claude | codex | copilot | gemini | both | all | auto
iago install --skill-only=iago        # iago | squawk | both
iago install --version=v0.1.1         # pin to a specific release
iago install --dry-run                # show plan, change nothing
iago uninstall --target=claude
iago doctor                           # show install paths and detected versions
iago version
```

`update` is an alias for `install` — re-running picks up the latest release.

## Where do skills land?

| Target  | Path                       |
|---------|----------------------------|
| claude  | `~/.claude/skills/`        |
| codex   | `~/.agents/skills/`        |
| copilot | `~/.copilot/skills/`       |
| gemini  | `~/.gemini/skills/`        |

Each install drops a `.iago-version` marker so `iago doctor` can show what's installed.

## Why a CLI in addition to install.sh?

The shell installer (`curl … | bash`) still works and ships in the same repo.
The TS CLI is a parallel channel for users who already have Node/Bun and prefer
not to pipe shell scripts. Both honor the same flags, the same `.iago-version`
marker, and the same `IAGO_LOCAL_TARBALL` test hook — pick whichever you like.

## Project links

- Repo: https://github.com/drakulavich/iago
- Issues: https://github.com/drakulavich/iago/issues
- Full docs (Action / skills / hooks): see the repo README.

## License

MIT.
