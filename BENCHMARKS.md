# Iago Benchmarks

How Iago is tested, and the numbers behind it. Everything here is **deterministic
and reproducible offline** — no API key, no network.

```bash
python evals/run.py            # regenerate the tables below
python evals/run.py --check    # CI gate: thresholds + doc-drift
```

## What this measures

Iago's diagram pipeline has one deterministic decision and one deterministic
generator, and this suite benchmarks both:

1. **Diagram-type selection** — `classify_diagram_type` maps a diff to one of
   `sequence / flow / class / er`, or abstains. The LLM never makes this choice.
2. **Abstention** — trivial diffs (docs / deps / < 10 net code lines) must be
   skipped, not diagrammed.
3. **Mermaid validity (heuristic path)** — every diagram from
   `heuristic_diagram()` must parse.

Selection + abstention are scored as one 5-class problem (`abstain` is a class).

## What this does NOT measure yet

- **LLM-output faithfulness / usefulness.** When an API key is configured, Iago
  draws the diagram with an LLM. That output is currently **spot-checked by hand**,
  not benchmarked. An LLM-as-judge eval is on the roadmap.
- **Validity of LLM-generated Mermaid.** Nondeterministic and key-gated; out of
  scope for the CI suite.

## Corpus

Hybrid: hand-authored **synthetic** fixtures exercise every rubric branch;
**real** cases are captured from public PRs (`python evals/capture.py`), stored
with provenance for attribution. The real set grows over time.

## Results

<!-- eval:results:start -->
_Run `python evals/run.py` to populate._
<!-- eval:results:end -->

## Reproduce

```bash
cd evals && npm install && cd ..   # one-time: mermaid + jsdom for validity
python -m pytest evals/tests       # harness self-tests
python evals/run.py                # scores + regenerated tables
```
