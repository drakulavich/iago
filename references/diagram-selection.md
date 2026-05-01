# Diagram type selection rubric

Pick the **single** diagram type that gives a reviewer the most insight in
the smallest amount of space. If multiple categories apply, use the
priority order below — but always prefer the one that matches the
*intent* of the PR (read the title and body), not just file extensions.

## Priority order

1. **`er` — Entity Relation**
   Strong signals:
   - Files matching: `**/migrations/**`, `**/migrate/**`, `*.sql`,
     `schema.prisma`, `schema.sql`, `db/schema.rb`, `**/models/*.py`,
     `**/entities/*.ts`, `*.dbml`.
   - Diff hunks containing: `CREATE TABLE`, `ALTER TABLE`, `ADD COLUMN`,
     `FOREIGN KEY`, `@Entity`, `class Meta:` with `db_table`, `model {`
     (Prisma).
   - PR title/body keywords: `schema`, `migration`, `model`, `column`,
     `index`, `foreign key`.

2. **`class` — Class hierarchy**
   Strong signals:
   - ≥2 files in OO languages (TS, Java, C#, Kotlin, Python, Swift, Rust
     traits) where the diff adds/changes `class`, `interface`, `trait`,
     `extends`, `implements`, `abstract`, `protocol`.
   - PR title/body keywords: `refactor … class`, `inheritance`,
     `interface`, `subclass`, `abstract`, `polymorphism`.
   - Skip if the only OO change is a small method body edit — that is a
     `flow` candidate instead.

3. **`sequence` — Sequence**
   Strong signals:
   - New or changed HTTP/RPC handlers (`router`, `app.get`, `@app.route`,
     `gRPC`, `Controller`), queue producers/consumers, websocket events,
     cross-service calls.
   - Diff touches ≥2 of: client code, API/handler code, worker/consumer
     code, external SDK call.
   - PR title/body keywords: `flow`, `endpoint`, `webhook`, `event`,
     `request`, `pipeline` (when crossing components).

4. **`flow` — Flowchart**
   Strong signals:
   - Logic changes inside one component: new branching, retries, state
     machines, validation pipelines, parsing.
   - Single-file or single-module diffs that introduce non-trivial
     decision points.
   - PR title/body keywords: `state machine`, `retry`, `validation`,
     `algorithm`, `condition`, `guard`.

## Tie-breakers

- If signals 1 and 3 both fire (e.g. a migration *and* a new endpoint
  using it), prefer **`er`** — schema diagrams age better and are harder
  to reconstruct mentally.
- If signals 2 and 4 both fire, prefer **`class`** when the PR
  introduces *new* types; prefer **`flow`** when the PR changes how
  existing types behave.
- If two signals tie at equal strength, prefer the one with **fewer
  nodes** in the resulting diagram — clarity beats coverage.

## Abstain

Do **not** generate a diagram when:

- The PR is docs-only, formatting-only, or a dependency bump.
- The diff is < 10 changed lines of executable code.
- The PR is labeled `skip-diagram`, `no-diagram`, `chore`, or
  `dependencies` (configurable per-repo).
- The PR title starts with `chore(release)`, `chore(deps)`, or `docs:`.

When abstaining, post nothing and tell the user one line: "Skipped — PR
is too small / docs-only to benefit from a diagram."
