# Iago Runtime Helper → TypeScript — Design

**Date:** 2026-05-30
**Status:** Approved (design); pending implementation plan

## Problem

The skill's runtime helper is split across two languages the repo owner doesn't
read comfortably: `iago/scripts/append_diagram.sh` (bash + an inline Python
heredoc) and `iago/scripts/sanitize_mermaid.py`. It is also **untested** (bats
covers `install.sh`, not this). Meanwhile the README has drifted out of date
after the skill-first refactor.

This redesign consolidates the runtime helper into **one language (TypeScript,
run by Bun)**, makes it **unit-tested**, and brings the docs back in sync.

## Decisions (from brainstorm)

- **Skill-first** tool; runtime may require a JS runtime (decided earlier).
- **Bun-only at runtime**, ship the `.ts` directly — no build step, no committed
  artifact. The skill ships exactly the code that runs (maximally transparent).
- Helper lives **inside the skill folder** (`iago/scripts/`) because the folder
  is copied standalone into agent dirs — it cannot import from `cli/` at runtime.
- The skill folder stays **dependency-free**: the helper uses only Node built-ins
  (`node:child_process`, `node:fs`, `node:path`), which Bun runs. No
  `package.json` / `node_modules` is ever added to `iago/`.

## Runtime requirements (after this change)

- `bun` (runs the `.ts` helper)
- `gh` (authenticated — GitHub writes)
- ~~`jq`~~ and ~~`python3`~~ are **no longer required** (TS does JSON + regex).

## Architecture

```
iago/scripts/
├── sanitize.ts     # pure: ';' → ',' fix in sequenceDiagram message labels
└── post.ts         # gh-backed: find /review comment, idempotent replace, post; CLI entry
cli/tests/
├── sanitize.test.ts   # imports ../../iago/scripts/sanitize.ts
└── post.test.ts       # imports ../../iago/scripts/post.ts, mocks the gh runner
```

Tests live in `cli/tests/` so they run under the **existing** `cd cli && bun test`
setup (which already has `@types/node`), and nothing test-related touches the
copyable skill folder.

### Component 1 — `iago/scripts/sanitize.ts`

Port of `sanitize_mermaid.py`. Exports a pure function:

```ts
export function sanitize(src: string): string
```

- Operates only inside fenced ```` ```mermaid ```` blocks.
- On lines matching a `sequenceDiagram` message (`<participant><arrow><participant>: <text>`),
  replaces `;` → `,` in the message text only (GitHub's Mermaid treats `;` as a
  statement separator and truncates the label).
- Leaves flowchart/class/er bodies, notes, participants, and prose untouched.
- Mirror the Python arrow set: `->>`, `-->>`, `->`, `-->`, `-)`, `--)`, `-x`,
  `--x`, with optional `+`/`-` activation suffix.

### Component 2 — `iago/scripts/post.ts`

Port of `append_diagram.sh`. Pure, testable functions plus a thin CLI entry. The
`gh` interaction is injected so the logic is unit-testable without network.

```ts
type GhRunner = (args: string[], opts?: { input?: string }) => string; // stdout

export function findReviewCommentId(
  comments: Array<{ id: number; created_at: string; body: string; user: { login: string } }>,
  viewer: string,
): number | null;

export function replaceOrAppendBlock(currentBody: string, block: string): string;

export async function post(
  opts: { repo: string; pr: string; mode: "append" | "comment"; diagramFile: string },
  gh?: GhRunner,
): Promise<string>; // returns comment URL

export function main(argv: string[]): Promise<number>;
```

Behavior (identical to the bash version):

1. Read the wrapped block from `diagramFile`; run it through `sanitize()`.
2. `mode === "comment"` → post a new comment:
   `gh pr comment <pr> --repo <repo> --body-file <tmp>`.
3. `mode === "append"`:
   - viewer login: `gh api graphql -f query='{viewer{login}}' -q .data.viewer.login`.
   - comments: `gh api --paginate --slurp -H "Accept: application/vnd.github+json"
     /repos/<owner>/<name>/issues/<pr>/comments` → parse, `.flat()` the paginated
     array-of-arrays into one list.
   - `findReviewCommentId`: newest comment whose body contains
     `<!-- review-skill -->`; else newest comment by `viewer` whose body matches
     `/^\s*#{1,3}\s+Review\b/m`; else `null`.
   - If `null` → fall back to a new comment.
   - Else PATCH: `replaceOrAppendBlock` on the current body (replace any
     `<!-- iago:begin -->…<!-- iago:end -->` region, else append), then
     `gh api -X PATCH -H "Accept: application/vnd.github+json"
     /repos/<owner>/<name>/issues/comments/<id> -f body=<newBody>`.
4. Print the created/updated comment URL.

- `replaceOrAppendBlock`: regex `/<!--\s*iago:begin\s*-->[\s\S]*?<!--\s*iago:end\s*-->/`;
  if matched, replace with `block.trim()`; else append `"\n" + block.trim() + "\n"`
  (adding a leading newline only if the body doesn't already end in one).
- Default `GhRunner` wraps `child_process.execFileSync("gh", args, { encoding: "utf8", input })`
  — no shell, so no quoting/escaping hazards.
- Arg parsing: `--repo`, `--pr`, `--mode` (default `append`), `--diagram-file`;
  all required except `--mode`; unknown arg → exit 2 with a message.

### Component 3 — Tests (`cli/tests/`)

- `sanitize.test.ts`: a `;` in a sequence message becomes `,`; a `;` in a
  flowchart label / prose / outside any mermaid fence is left alone; non-mermaid
  fences untouched.
- `post.test.ts` (mocked `GhRunner`):
  - marker match wins over heading match;
  - heading+viewer fallback when no marker;
  - `replaceOrAppendBlock` replaces an existing block (idempotent — twice = once)
    and appends when absent;
  - no review comment → new-comment path;
  - `mode=comment` → always new comment, never PATCH.

## SKILL.md changes

Replace the bash invocation with:

```bash
SKILL_DIR="${CLAUDE_SKILL_DIR:-${OPENCODE_SKILL_DIR:-$(dirname "$0")}}"
bun run "$SKILL_DIR/scripts/post.ts" \
  --repo "$REPO" --pr "$PR" --mode "$MODE" --diagram-file "$DIAGRAM_FILE"
```

Update the "helper lives at `scripts/append_diagram.sh`" prose to `post.ts`, and
the "Required tools" note to **bun + gh** (drop jq/python3).

## Removed

- `iago/scripts/append_diagram.sh`
- `iago/scripts/sanitize_mermaid.py`

## Documentation / accuracy pass (folded in)

- **README repo layout:** list `iago/scripts/post.ts` + `sanitize.ts`; drop the
  shell/python entries.
- **README prereqs:** state the skill runtime needs `bun` + `gh`.
- **README install — `curl | bash`:** reword the "for systems without Node/Bun"
  rationale (running the skill now needs bun); it remains the "install without
  the npm CLI" path.
- **README Development:** drop `shellcheck … append_diagram.sh`; note
  `cd cli && bun test` now also covers `post`/`sanitize`.
- **Version drift:** bump `plugin.json` + `marketplace.json` `0.1.0` → `0.2.0`
  to match the published npm package; update any `--version=v0.1.1` example to
  `v0.2.0`.
- **`docs/demo.gif`:** remove the "coming soon" placeholder line from the README.

## Verification (must hold before done)

- `cd cli && bun test` — all green (including the new `post`/`sanitize` tests).
- `cd cli && bun run typecheck` — clean (it type-checks the imported skill `.ts`).
- `tests/*.bats` still pass; grep confirms no test or `install.sh`/`cli` code
  references the removed `append_diagram.sh` / `sanitize_mermaid.py`.
- A manual smoke: `bun run iago/scripts/post.ts --help`-style arg validation
  errors cleanly; `sanitize` round-trips a known sequence block.
- README contains no reference to `append_diagram.sh`, `sanitize_mermaid.py`,
  `jq`, `python3` (as a skill requirement), or `0.1.0`.

## Non-goals / YAGNI

- No build step, no committed JS artifact (bun runs `.ts`).
- No `iago post` subcommand in the `cli/` package — the skill ships its own
  `post.ts`; the CLI stays installer-only.
- No Node support at skill runtime (Bun only); no bats tests for the helper
  (TS unit tests replace that need).
- No change to install.sh / cli copy logic beyond what the file rename requires
  (both copy the whole `iago/` folder, so they pick up the new files
  automatically — to be verified, not redesigned).
