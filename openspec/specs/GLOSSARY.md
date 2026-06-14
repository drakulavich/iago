# Glossary

Canonical terms for the Iago spec corpus. Specs use these terms verbatim; if you
need a new term, add it here first.

| Term | Definition |
|---|---|
| **Iago** | This project: a skill-first tool that appends a Mermaid Diagram to a GitHub pull request's `/review` comment, published as `@drakulavich/iago`. |
| **Skill** | The agent-facing instruction set Iago ships (`iago/SKILL.md`, plus the `/squawk` alias `squawk/SKILL.md`) — copied verbatim into a Host agent's skills directory. |
| **Host agent** | The AI coding agent (Claude Code, Codex, Copilot, Gemini, opencode) that invokes the Skill and whose LLM actually draws the Diagram. Iago never calls an LLM itself. |
| **`/iago` / `/squawk`** | The slash invocations that run the Skill: `/iago [PR] [type]` and its alias `/squawk`. |
| **Diagram** | The Mermaid block Iago appends — drawn by the Host agent's LLM from the PR diff, then posted by the helper. |
| **Diagram type** | One of **sequence**, **flow**, **class**, or **entity-relation (er)** — auto-detected from the diff, overridable as the second argument. |
| **Diagram-selection rubric** | The heuristics for choosing a Diagram type from a diff (`iago/references/diagram-selection.md`). |
| **Mermaid** | The diagram markup GitHub renders. Iago authors GitHub-renderable Mermaid; templates live in `iago/references/mermaid-templates.md`. |
| **Mermaid reserved keyword** | An identifier GitHub's renderer rejects as a node/participant id — `loop`, `alt`, `opt`, `par`, `note`, `end`, `activate` (case-insensitive); never used as ids. |
| **`/review` comment** | The existing AI-review comment on a PR that Iago appends its Diagram to (the default `append` mode). |
| **Append (squawk)** | The default behavior — appending the Diagram to the end of the existing `/review` comment body (`iago/scripts/post.ts:50-51`) rather than posting a new comment. |
| **`--mode=comment`** | The flag that posts the Diagram as a standalone PR comment instead of appending to the `/review` comment. |
| **Re-run idempotency** | On a repeat invocation, Iago replaces its previous Diagram comment in place rather than duplicating it. |
| **post.ts** | The helper (`iago/scripts/post.ts`) that finds, replaces, and posts the Diagram comment via authenticated `gh`; its `gh api` PATCH uses `-f` (raw-field). |
| **sanitize.ts** | The helper (`iago/scripts/sanitize.ts`) that rewrites Mermaid sequence labels (`;` → `,`) so they render. |
| **Plugin** | The Claude Code plugin packaging (`.claude-plugin/plugin.json` + `marketplace.json`), one of the three distribution channels. |
| **Installer CLI** | The TypeScript/Bun installer under `cli/` (published as `@drakulavich/iago`) that copies the Skill into a Host agent via `install`. |
| **Install target** | A Host agent's skills directory the Installer CLI writes to (`install --target`); `doctor` reports the resolved paths. |
| **doctor** | The Installer CLI subcommand that reports install paths and environment readiness (`bun`, `gh`). |
| **Runtime** | The only things Iago's helper and CLI depend on at run time: **bun** + authenticated **gh** — no Action, no provider SDK, no shell/Python. |
