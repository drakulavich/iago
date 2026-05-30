from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _iago import classify_diagram_type, heuristic_diagram  # noqa: E402
from corpus_loader import load_corpus  # noqa: E402
from scoring import score, normalize  # noqa: E402
from validity import check_mermaid  # noqa: E402
from reporters import (  # noqa: E402
    render_summary_table, render_confusion, replace_block, badge_dict, results_dict,
)

EVALS = Path(__file__).resolve().parent
ROOT = EVALS.parent
CORPUS = EVALS / "corpus"
BADGE = EVALS / "badge.json"
RESULTS = EVALS / "results.json"
THRESHOLDS = EVALS / "thresholds.json"
BENCHMARKS = ROOT / "BENCHMARKS.md"
README = ROOT / "README.md"


def corpus_counts(cases) -> dict:
    by_source: dict = {}
    by_expected: dict = {}
    for c in cases:
        by_source[c.source] = by_source.get(c.source, 0) + 1
        by_expected[c.expected] = by_expected.get(c.expected, 0) + 1
    return {"by_source": by_source, "by_expected": by_expected}


def build(cases):
    result = score(cases, classify_diagram_type)
    diagrams = {}
    for c in cases:
        pred = normalize(classify_diagram_type(c.files, c.diff_text))
        if pred != "abstain":
            diagrams[c.id] = heuristic_diagram(pred, c.files)
    validity = check_mermaid(diagrams)
    return result, validity


def _rendered(result, validity, cases):
    summary = render_summary_table(result, validity)
    bench_inner = summary + "\n\n#### Confusion matrix\n\n" + render_confusion(result)
    return {
        "bench": bench_inner,
        "readme": summary,
        "badge_text": json.dumps(badge_dict(result), indent=2) + "\n",
        "results_text": json.dumps(
            results_dict(result, validity, corpus_counts(cases)), indent=2, sort_keys=True
        ) + "\n",
    }


def _thresholds() -> dict:
    if THRESHOLDS.exists():
        return json.loads(THRESHOLDS.read_text())
    return {"min_selection_accuracy": 0.0}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Iago deterministic eval suite")
    ap.add_argument("--check", action="store_true",
                    help="fail on threshold breach or stale published artifacts")
    args = ap.parse_args(argv)

    cases = load_corpus(CORPUS)
    result, validity = build(cases)
    r = _rendered(result, validity, cases)

    print(f"cases={result.n} accuracy={result.accuracy:.1%} "
          f"validity={validity.passed}/{validity.checked}")
    for cid, exp, pred in result.misses:
        print(f"  MISS {cid}: expected {exp}, got {pred}")
    for f in validity.failures:
        print(f"  INVALID {f['id']}: {f['error']}")

    if args.check:
        failed = False
        th = _thresholds()
        if validity.checked and validity.passed != validity.checked:
            print("FAIL: not all heuristic diagrams parse")
            failed = True
        if result.accuracy < th["min_selection_accuracy"]:
            print(f"FAIL: accuracy {result.accuracy:.1%} < min "
                  f"{th['min_selection_accuracy']:.1%}")
            failed = True
        for path, expected in [
            (BENCHMARKS, replace_block(BENCHMARKS.read_text(), r["bench"])),
            (README, replace_block(README.read_text(), r["readme"])),
            (BADGE, r["badge_text"]),
            (RESULTS, r["results_text"]),
        ]:
            actual = path.read_text() if path.exists() else ""
            if actual != expected:
                print(f"FAIL: {path.name} is stale — run `python evals/run.py` and commit")
                failed = True
        return 1 if failed else 0

    BENCHMARKS.write_text(replace_block(BENCHMARKS.read_text(), r["bench"]))
    README.write_text(replace_block(README.read_text(), r["readme"]))
    BADGE.write_text(r["badge_text"])
    RESULTS.write_text(r["results_text"])
    print("artifacts updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
