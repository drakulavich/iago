# Iago Eval Suite — Design

**Date:** 2026-05-30
**Status:** Approved (design); pending implementation plan

## Problem

Iago's existing tests (`tests/*.bats`, `cli/tests/*.ts`) cover only *plumbing* —
the installer, manifest validity, CLI arg parsing, and install targeting. None
of them measure the actual product: the quality of the diagram Iago produces
for a given diff. A public question ("How do you test this skill? Benchmarks /
evals? Are you planning to publish them?") exposes the gap.

This spec designs a **deterministic, offline, keyless eval suite** that
benchmarks the parts of Iago's behavior that can be measured objectively, and
publishes the results.

## Scope

### In scope (all deterministic)

1. **Diagram-type selection accuracy** — given a diff, does
   `classify_diagram_type` pick the right type?
2. **Abstention** — does Iago correctly skip trivial diffs (docs / deps /
   formatting) instead of emitting a diagram?
3. **Mermaid validity (heuristic path only)** — does
   `heuristic_diagram()` output parse without error?

Selection and abstention collapse into one 5-class classification problem: each
diff maps to exactly one of `{sequence, flow, class, er, abstain}`.

### Out of scope (explicitly, for now)

- **LLM-output faithfulness / usefulness.** `generate_with_llm()` is
  nondeterministic and costs money. Its output is spot-checked manually today.
  An LLM-as-judge eval is a roadmap item, named as such in `BENCHMARKS.md`.
- **Validity of LLM-generated Mermaid.** Same reason. Only the deterministic
  heuristic generator is gated.

## Why this is feasible

From `action/scripts/run.py`:

- `classify_diagram_type(files, diff_text) -> Optional[str]` (run.py:124) is
  **pure and deterministic** — no I/O. The **LLM never selects the type**; it
  only draws content for an already-chosen type. So selection + abstention are
  100% reproducible without an API key or network.
- It reads only `filename`, `additions`, `deletions` per file (plus the raw
  `diff_text`). The `<10` net-line threshold drives abstention.
- `heuristic_diagram(dtype, files) -> str` (run.py:265) emits Mermaid
  deterministically.

The eval imports these production functions directly — it benchmarks the exact
code that ships, with no reimplementation to drift.

## Architecture

```
evals/
├── corpus/
│   ├── synthetic/*.json      # hand-authored, bulk coverage of rubric signals
│   └── real/*.json           # 10–20 captured public PRs, with provenance
├── run.py                    # the driver: classify → score → validity → report
├── capture.py                # gh-backed helper to snapshot a real PR into corpus/real/
├── mermaid_check.mjs         # Node mermaid.parse() validator (parse-only)
├── reporters.py              # results.json + marker-block regeneration + badge.json
├── badge.json                # shields.io endpoint payload (committed, CI-regenerated)
└── tests/                    # unit tests for the harness itself
BENCHMARKS.md                 # the publishable artifact (CI-regenerated table)
```

### Component 1 — Corpus

One JSON file per case. Explicit shape, no diff-parsing guesswork:

```json
{
  "id": "er-add-orders-table",
  "expected": "er",
  "source": "synthetic",
  "provenance": null,
  "files": [
    {"filename": "migrations/003_orders.sql", "additions": 14, "deletions": 0}
  ],
  "diff_text": "diff --git a/migrations/003_orders.sql ..."
}
```

- `expected ∈ {sequence, flow, class, er, abstain}`.
- **Synthetic** cases (the bulk) are authored to exercise each rubric branch:
  at minimum one ER (migration/SQL/Prisma/`@Entity`), one class (≥2 OO files
  with a `+class/interface/trait`), one sequence (handler + ≥2 of
  client/handler/worker), one flow (non-trivial logic, no other signal), and
  several abstain cases (docs-only, lockfile-only, < 10 net lines).
- **Real** cases are captured by a helper (`make capture PR=<n>` /
  `python evals/capture.py <n>`) that calls `gh pr view <n> --json files` and
  `gh pr diff <n>`, then writes the JSON with `provenance`
  (`{repo, pr, sha, url}`) for attribution. Storing gh-reported
  `additions`/`deletions` keeps the `<10` threshold exact.

**Dependency:** the corpus is the contract; `run.py` consumes it, nothing else.

### Component 2 — Runner (`evals/run.py`)

- Loads every case from `corpus/**`.
- For each case: `predicted = classify_diagram_type(files, diff_text)`,
  mapping `None → "abstain"`.
- Builds: 5-class confusion matrix, overall accuracy, per-class
  precision/recall/F1, and abstention precision/recall reported separately.
- For each non-abstain case, calls `heuristic_diagram(predicted, files)` and
  collects the output for validity checking.
- Pipes collected diagrams to `mermaid_check.mjs`; records pass/fail per case.
- Modes:
  - default: run, print a human summary, regenerate published artifacts.
  - `--check`: regenerate into memory and **fail (nonzero)** if (a) any
    artifact differs from its committed version, or (b) any threshold is
    breached. This is the CI gate and the docs-in-sync gate in one.

**Interface:** imports `classify_diagram_type`, `heuristic_diagram` from
`action/scripts/run.py` (added to `sys.path`). Depends on the corpus and the
validator.

### Component 3 — Validator (`evals/mermaid_check.mjs`)

- Node script. Reads one or more Mermaid sources (newline-delimited paths or
  stdin records), calls `mermaid.parse()` (parse-only — **no headless
  Chromium**), exits nonzero on the first parse failure with the offending id.
- **Fallback:** if `mermaid.parse()` requires a DOM in the CI Node env, add
  `jsdom` and a minimal global shim. Heuristic output is structurally simple,
  so this is expected to be unnecessary; the spec records it as the contingency.

**Interface:** stdin/argv in, exit code + per-id report out. No knowledge of the
corpus or scoring.

### Component 4 — Reporters (`evals/reporters.py`)

- `results.json`: machine-readable scores. **Deterministic** — keyed only on
  corpus + code. **No wall-clock timestamp** (would break `--check`). Commit SHA,
  if recorded at all, lives outside the compared artifacts.
- Regenerates marker-delimited blocks between
  `<!-- eval:results:start -->` and `<!-- eval:results:end -->` in:
  - `BENCHMARKS.md` (full table + confusion matrix)
  - `README.md` (compact table)
- `badge.json`: shields.io endpoint schema
  (`{"schemaVersion":1,"label":"selection accuracy","message":"NN%","color":"…"}`),
  surfaced in the README header as
  `https://img.shields.io/endpoint?url=…/main/evals/badge.json`.

**Interface:** takes the scored result object, rewrites files in place. Pure
string templating + marker replacement so it is unit-testable.

### Component 5 — CI

- A new keyless job (extend `.github/workflows/test.yml` or add `evals.yml`)
  running `python evals/run.py --check`.
- Hard gate. Deterministic. No secrets. Runs on Ubuntu (and macOS is optional —
  the logic is platform-independent Python, so Ubuntu alone is sufficient).
- Node is already available in CI (the TS CLI uses Bun/Node), so the validator
  needs no extra runtime setup beyond `npm i mermaid` (or a pinned, cached dep).

### Component 6 — `BENCHMARKS.md` (publishable artifact)

Sections:
1. **What is measured** — the three deterministic axes.
2. **What is *not* measured yet** — LLM faithfulness / LLM-output validity;
   spot-checked only; LLM-judge eval on the roadmap. (Credibility hinges on
   stating this plainly.)
3. **Corpus** — counts by source and by expected type; how real cases were
   captured and attributed.
4. **Results** — CI-regenerated table + confusion matrix (marker block).
5. **Reproduce** — `python evals/run.py` (no key, no network).
6. **Growth policy** — how to add cases; real-PR set grows over time.

### Component 7 — Harness self-tests (`evals/tests/`)

Unit tests for the parts that could silently lie:
- corpus/label loading (schema validation, bad-case rejection),
- confusion-matrix + P/R/F1 math (known fixtures),
- marker-block replacement (golden in/out, idempotency).

These run in the same CI job.

## Thresholds

- **Mermaid validity:** 100% of heuristic outputs must parse. Any failure is a
  hard fail.
- **Selection accuracy:** gated at a baseline established from the first full
  run (recorded in `BENCHMARKS.md`). The gate is "must not regress below
  baseline," not an aspirational absolute. Abstention recall is reported and
  watched but starts as report-only to avoid over-fitting the corpus to the
  heuristic.

## Error handling

- Malformed corpus JSON → loader raises with the offending file path; run fails
  fast (not silently skipped).
- Validator parse failure → reported with case id; `--check` returns nonzero.
- Missing Node / mermaid dep → clear actionable error, not a stack trace.
- `--check` artifact drift → prints a unified diff of expected vs committed so
  the fix is "run `python evals/run.py` and commit."

## Testing strategy

- The product logic under test is exercised by the corpus itself.
- The harness is covered by `evals/tests/` (Component 7).
- CI gate (`--check`) guarantees published numbers and docs never drift from the
  committed corpus + code.

## Non-goals / YAGNI

- No LLM calls anywhere in the suite.
- No headless-browser Mermaid rendering (parse-only is sufficient for validity).
- No web dashboard; `BENCHMARKS.md` + README badge are the publish surface.
- No historical trend tracking in v1 (could be added later from `results.json`).

## Open questions (resolved during brainstorm)

- Axes: selection + abstention + heuristic-render-validity. ✔
- Corpus: hybrid (synthetic bulk + small curated real set). ✔
- Validity scope: heuristic path only, CI gate. ✔
- Publish surface: `BENCHMARKS.md` + README table & badge. ✔
