# Installing Iago

← [back to README](../README.md)

Iago is a skill for your coding agent. Pick the install that fits your stack.

**Runtime requirements:** `bun` (runs the helper) and `gh` (authenticated, for the GitHub write).

## Node / Bun (recommended)

If you have Node ≥18 or Bun, this is the friendliest path — fully typed, with a
`--dry-run` flag and a `doctor` subcommand. Auto-detects Claude Code, Codex,
Copilot, and Gemini:

```bash
bunx @drakulavich/iago install --force      # auto-detects your agents
npx  @drakulavich/iago install --force      # same, via npm
```

Re-run the same command to update. Other commands:

```bash
bunx @drakulavich/iago doctor                # show install paths and versions
bunx @drakulavich/iago install --target=both # install into all agent dirs
bunx @drakulavich/iago install --version=v0.2.0
bunx @drakulavich/iago uninstall --target=claude
```

## Claude Code (plugin)

Install from the iago marketplace:

```bash
/plugin marketplace add drakulavich/iago
/plugin install iago@iago-marketplace
/reload-plugins
```

Already added the marketplace before? Refresh it first so it picks up the
latest manifest: `/plugin marketplace update iago-marketplace`.

Plugin skills are namespaced by the plugin, so invoke them as:

```text
/iago:iago        # auto-detect PR + diagram type, append to /review
/iago:squawk      # the /squawk alias, same behavior
```

Confirm it loaded under `/plugin` → **Installed**, or check that `/iago:` shows
up in the skill list.

Once it's accepted into Anthropic's community marketplace, you'll be able to
install it from there instead:

```bash
/plugin marketplace add anthropics/claude-plugins-community
/plugin install iago@claude-community
```

**Prefer the bare `/iago` and `/squawk` names** (no plugin namespace)? Copy the
skill folders in directly instead of installing the plugin:

```bash
git clone https://github.com/drakulavich/iago /tmp/iago-skill
cp -R /tmp/iago-skill/iago    ~/.claude/skills/iago
cp -R /tmp/iago-skill/squawk  ~/.claude/skills/squawk
rm -rf /tmp/iago-skill
```

Invoke with `/iago` or `/squawk` in any session, or just say "squawk this PR".

## Codex CLI

```bash
git clone https://github.com/drakulavich/iago /tmp/iago-skill
cp -R /tmp/iago-skill/iago    ~/.agents/skills/iago
cp -R /tmp/iago-skill/squawk  ~/.agents/skills/squawk
rm -rf /tmp/iago-skill
```

Invoke with `$iago`, `$squawk`, or `/skills`. Same `SKILL.md` open standard,
no Codex-specific changes needed.

## Copilot CLI / Gemini CLI

Drop the two skill folders into `.github/skills/` (Copilot) or `.gemini/skills/`
(Gemini). Behavior is identical.
