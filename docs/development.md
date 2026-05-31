# Development

← [back to README](../README.md)

## Repo layout

```
iago/
├── .claude-plugin/
│   ├── marketplace.json                # Claude Code marketplace manifest
│   └── plugin.json                     # Plugin manifest
├── iago/
│   ├── SKILL.md                        # Main skill
│   ├── scripts/post.ts                 # Posts / appends the diagram to the PR (bun)
│   ├── scripts/sanitize.ts             # Mermaid sequence-label sanitizer
│   ├── references/
│   │   ├── diagram-selection.md        # Rubric for picking the diagram type
│   │   └── mermaid-templates.md
│   └── examples/
│       ├── sequence.md
│       ├── flow.md
│       ├── class.md
│       └── er.md
├── squawk/
│   └── SKILL.md                        # Alias for iago
└── cli/                                # @drakulavich/iago installer (TypeScript / Bun)
```

## Build & test

The installer and skill helper live in `cli/` (TypeScript, run with Bun):

```bash
cd cli
bun install
bun test                               # cli + skill helper (post.ts / sanitize.ts) tests
bun run typecheck                      # tsc --noEmit
bun run dev install --target=claude --dry-run
```

CI runs the suite on Ubuntu and **macOS**. The macOS leg is critical: it tests
the TS tarball extractor against macOS's BSD `tar` (catches differences from
GNU tar). Tests are offline (no network) thanks to the `IAGO_LOCAL_TARBALL`
hook. Plugin manifests are checked separately by `claude plugin validate
--strict`.
