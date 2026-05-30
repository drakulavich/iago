# Iago Eval Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, offline, keyless benchmark that scores Iago's diagram-type selection, abstention, and heuristic Mermaid validity over a hybrid corpus, and publishes the numbers to `BENCHMARKS.md` + a README badge.

**Architecture:** A Python driver (`evals/run.py`) imports the *production* `classify_diagram_type` and `heuristic_diagram` from `action/scripts/run.py` (no reimplementation), scores them over `evals/corpus/**/*.json`, validates heuristic output via a parse-only Node helper (`mermaid_check.mjs`), and regenerates marker-delimited result blocks. A `--check` mode gates CI on thresholds and doc-drift.

**Tech Stack:** Python 3 (stdlib + pytest), Node (mermaid + jsdom, parse-only), GitHub Actions.

**Conventions for this plan:** all Python commands are run **from the repo root**. Pytest discovers `evals/conftest.py` which puts `evals/` on `sys.path`, so harness modules import each other as top-level modules (`from scoring import ...`).

---

## File Structure

```
evals/
├── conftest.py            # puts evals/ on sys.path for pytest
├── _iago.py               # imports classify_diagram_type + heuristic_diagram from action/scripts/run.py
├── corpus_loader.py       # Case dataclass + load_corpus(); schema validation
├── scoring.py             # score() → confusion matrix, accuracy, per-class P/R/F1
├── validity.py            # check_mermaid() → calls mermaid_check.mjs
├── reporters.py           # results.json + table rendering + marker-block replacement + badge
├── run.py                 # CLI driver; default writes artifacts, --check gates
├── capture.py             # gh-backed helper to snapshot a real PR into corpus/real/
├── mermaid_check.mjs      # Node parse-only validator
├── package.json           # node deps (mermaid, jsdom)
├── thresholds.json        # {min_selection_accuracy}
├── badge.json             # shields endpoint payload (committed, regenerated)
├── results.json           # machine-readable scores (committed, regenerated)
├── corpus/
│   ├── synthetic/*.json
│   └── real/*.json
└── tests/
    ├── test_corpus_loader.py
    ├── test_scoring.py
    ├── test_reporters.py
    └── test_validity.py
BENCHMARKS.md              # publishable artifact with marker block
README.md                  # +badge in header, +Benchmarks section with marker block
.github/workflows/test.yml # +evals job
```

---

### Task 1: Scaffold + import production functions

**Files:**
- Create: `evals/conftest.py`
- Create: `evals/_iago.py`
- Test: `evals/tests/test_iago_import.py`

- [ ] **Step 1: Write `evals/conftest.py`**

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
```

- [ ] **Step 2: Write the failing test**

`evals/tests/test_iago_import.py`:

```python
from _iago import classify_diagram_type, heuristic_diagram


def test_production_functions_are_callable():
    assert callable(classify_diagram_type)
    assert callable(heuristic_diagram)


def test_classify_abstains_on_trivial_change():
    files = [{"filename": "README.md", "additions": 40, "deletions": 1}]
    assert classify_diagram_type(files, "") is None
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest evals/tests/test_iago_import.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named '_iago'`

- [ ] **Step 4: Write `evals/_iago.py`**

```python
"""Load the production diagram functions under test, without re-implementing them.

Imports `action/scripts/run.py` as a module so the eval benchmarks the exact
code that ships. run.py guards its CLI behind `if __name__ == "__main__"`, so
importing it has no side effects beyond defining functions and regex constants.
"""
import importlib.util
from pathlib import Path

_RUN_PY = Path(__file__).resolve().parents[1] / "action" / "scripts" / "run.py"


def _load():
    spec = importlib.util.spec_from_file_location("iago_run", _RUN_PY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_mod = _load()
classify_diagram_type = _mod.classify_diagram_type
heuristic_diagram = _mod.heuristic_diagram
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest evals/tests/test_iago_import.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add evals/conftest.py evals/_iago.py evals/tests/test_iago_import.py
git commit -m "test(evals): bootstrap import of production diagram functions"
```

---

### Task 2: Corpus loader

**Files:**
- Create: `evals/corpus_loader.py`
- Test: `evals/tests/test_corpus_loader.py`

- [ ] **Step 1: Write the failing test**

`evals/tests/test_corpus_loader.py`:

```python
import json
import pytest
from corpus_loader import load_case, load_corpus, Case, LABELS


def _write(tmp_path, name, data):
    p = tmp_path / name
    p.write_text(json.dumps(data))
    return p


GOOD = {
    "id": "er-orders",
    "expected": "er",
    "source": "synthetic",
    "provenance": None,
    "files": [{"filename": "migrations/1.sql", "additions": 12, "deletions": 0}],
    "diff_text": "CREATE TABLE orders (...)",
}


def test_load_case_returns_dataclass(tmp_path):
    case = load_case(_write(tmp_path, "a.json", GOOD))
    assert isinstance(case, Case)
    assert case.id == "er-orders"
    assert case.expected == "er"


def test_missing_key_raises(tmp_path):
    bad = {k: v for k, v in GOOD.items() if k != "expected"}
    with pytest.raises(ValueError, match="missing required key 'expected'"):
        load_case(_write(tmp_path, "b.json", bad))


def test_bad_expected_label_raises(tmp_path):
    bad = {**GOOD, "expected": "uml"}
    with pytest.raises(ValueError, match="expected must be one of"):
        load_case(_write(tmp_path, "c.json", bad))


def test_duplicate_ids_raise(tmp_path):
    (tmp_path / "synthetic").mkdir()
    _write(tmp_path / "synthetic", "x.json", GOOD)
    _write(tmp_path / "synthetic", "y.json", GOOD)  # same id
    with pytest.raises(ValueError, match="duplicate case ids"):
        load_corpus(tmp_path)


def test_labels_constant():
    assert LABELS == ("sequence", "flow", "class", "er", "abstain")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest evals/tests/test_corpus_loader.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'corpus_loader'`

- [ ] **Step 3: Write `evals/corpus_loader.py`**

```python
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

LABELS = ("sequence", "flow", "class", "er", "abstain")
_SOURCES = ("synthetic", "real")
_REQUIRED = ("id", "expected", "source", "files", "diff_text")


@dataclass(frozen=True)
class Case:
    id: str
    expected: str
    source: str
    provenance: Optional[dict]
    files: list[dict]
    diff_text: str


def _validate(raw: dict, path: Path) -> None:
    for key in _REQUIRED:
        if key not in raw:
            raise ValueError(f"{path}: missing required key '{key}'")
    if raw["expected"] not in LABELS:
        raise ValueError(f"{path}: expected must be one of {LABELS}, got {raw['expected']!r}")
    if raw["source"] not in _SOURCES:
        raise ValueError(f"{path}: source must be one of {_SOURCES}, got {raw['source']!r}")
    if not isinstance(raw["files"], list) or not raw["files"]:
        raise ValueError(f"{path}: files must be a non-empty list")
    for f in raw["files"]:
        if "filename" not in f:
            raise ValueError(f"{path}: every file entry needs a 'filename'")


def load_case(path: Path) -> Case:
    raw = json.loads(Path(path).read_text())
    _validate(raw, Path(path))
    return Case(
        id=raw["id"],
        expected=raw["expected"],
        source=raw["source"],
        provenance=raw.get("provenance"),
        files=raw["files"],
        diff_text=raw["diff_text"],
    )


def load_corpus(root: Path) -> list[Case]:
    cases = [load_case(p) for p in sorted(Path(root).rglob("*.json"))]
    ids = [c.id for c in cases]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        raise ValueError(f"duplicate case ids: {dupes}")
    return cases
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest evals/tests/test_corpus_loader.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add evals/corpus_loader.py evals/tests/test_corpus_loader.py
git commit -m "feat(evals): corpus loader with schema validation"
```

---

### Task 3: Scoring

**Files:**
- Create: `evals/scoring.py`
- Test: `evals/tests/test_scoring.py`

- [ ] **Step 1: Write the failing test**

`evals/tests/test_scoring.py`:

```python
from corpus_loader import Case
from scoring import score, normalize


def _case(cid, expected):
    return Case(id=cid, expected=expected, source="synthetic",
                provenance=None, files=[{"filename": "x"}], diff_text="")


def test_normalize_maps_none_to_abstain():
    assert normalize(None) == "abstain"
    assert normalize("flow") == "flow"


def test_perfect_score():
    cases = [_case("a", "er"), _case("b", "flow")]
    # classifier returns exactly the expected label
    result = score(cases, lambda files, diff: {"a": "er", "b": "flow"}.get(files[0].get("k")))
    # use ids via a closure instead:
    pass


def test_accuracy_and_confusion():
    cases = [_case("a", "er"), _case("b", "er"), _case("c", "flow")]
    preds = {"a": "er", "b": "flow", "c": "flow"}

    def classify(files, diff):
        return preds[files[0]["filename"]]

    cases = [
        Case(id="a", expected="er", source="synthetic", provenance=None,
             files=[{"filename": "a"}], diff_text=""),
        Case(id="b", expected="er", source="synthetic", provenance=None,
             files=[{"filename": "b"}], diff_text=""),
        Case(id="c", expected="flow", source="synthetic", provenance=None,
             files=[{"filename": "c"}], diff_text=""),
    ]
    result = score(cases, classify)
    assert result.n == 3
    assert abs(result.accuracy - 2 / 3) < 1e-9
    assert result.confusion["er"]["er"] == 1
    assert result.confusion["er"]["flow"] == 1
    assert result.confusion["flow"]["flow"] == 1
    assert ("b", "er", "flow") in result.misses
    er = result.per_class["er"]
    assert er.support == 2
    assert er.recall == 0.5      # 1 of 2 er cases predicted er
    assert er.precision == 1.0   # all er predictions were correct


def test_abstain_is_scored_like_any_label():
    cases = [Case(id="d", expected="abstain", source="synthetic",
                  provenance=None, files=[{"filename": "d"}], diff_text="")]
    result = score(cases, lambda files, diff: None)
    assert result.accuracy == 1.0
    assert result.confusion["abstain"]["abstain"] == 1
```

> Note: delete the stub `test_perfect_score` body above if your runner flags the unused `result`; it is intentionally a no-op placeholder kept out of the assertions. Prefer removing it entirely — the real coverage is in `test_accuracy_and_confusion`.

- [ ] **Step 2: Remove the placeholder test**

Delete `test_perfect_score` entirely from the file (it was shown only to flag the anti-pattern). Final file keeps `test_normalize_maps_none_to_abstain`, `test_accuracy_and_confusion`, `test_abstain_is_scored_like_any_label`.

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest evals/tests/test_scoring.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'scoring'`

- [ ] **Step 4: Write `evals/scoring.py`**

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

from corpus_loader import Case, LABELS


def normalize(predicted: Optional[str]) -> str:
    return predicted if predicted else "abstain"


def _safe_div(a: float, b: float) -> float:
    return a / b if b else 0.0


@dataclass
class Metrics:
    precision: float
    recall: float
    f1: float
    support: int


@dataclass
class Result:
    n: int
    accuracy: float
    confusion: dict            # actual -> {predicted -> count}
    per_class: dict            # label -> Metrics
    misses: list               # [(id, expected, predicted)]


def score(cases: list[Case], classify: Callable[[list[dict], str], Optional[str]]) -> Result:
    confusion = {a: {p: 0 for p in LABELS} for a in LABELS}
    misses: list = []
    correct = 0
    for c in cases:
        pred = normalize(classify(c.files, c.diff_text))
        confusion[c.expected][pred] += 1
        if pred == c.expected:
            correct += 1
        else:
            misses.append((c.id, c.expected, pred))

    per_class = {}
    for label in LABELS:
        tp = confusion[label][label]
        fp = sum(confusion[a][label] for a in LABELS if a != label)
        fn = sum(confusion[label][p] for p in LABELS if p != label)
        precision = _safe_div(tp, tp + fp)
        recall = _safe_div(tp, tp + fn)
        per_class[label] = Metrics(
            precision=precision,
            recall=recall,
            f1=_safe_div(2 * precision * recall, precision + recall),
            support=sum(confusion[label].values()),
        )

    return Result(
        n=len(cases),
        accuracy=_safe_div(correct, len(cases)),
        confusion=confusion,
        per_class=per_class,
        misses=misses,
    )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest evals/tests/test_scoring.py -v`
Expected: PASS (3 passed)

- [ ] **Step 6: Commit**

```bash
git add evals/scoring.py evals/tests/test_scoring.py
git commit -m "feat(evals): scoring with confusion matrix and per-class metrics"
```

---

### Task 4: Mermaid validator (Node) + Python wrapper

**Files:**
- Create: `evals/package.json`
- Create: `evals/mermaid_check.mjs`
- Create: `evals/validity.py`
- Test: `evals/tests/test_validity.py`

- [ ] **Step 1: Write `evals/package.json`**

```json
{
  "name": "iago-evals",
  "private": true,
  "type": "module",
  "dependencies": {
    "jsdom": "^24.0.0",
    "mermaid": "^10.9.0"
  }
}
```

- [ ] **Step 2: Install node deps**

Run: `cd evals && npm install && cd ..`
Expected: creates `evals/node_modules` and `evals/package-lock.json`.

- [ ] **Step 3: Write `evals/mermaid_check.mjs`**

```javascript
// Reads JSON `[{id, src}, ...]` from stdin, validates each with mermaid.parse()
// (parse-only — no headless browser). Writes `{"failures":[{id,error}]}` to
// stdout. Exit 0 if all parse, 1 if any fail, 2 on internal error.
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><body></body>", { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;

const mermaid = (await import("mermaid")).default;
mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
let cases;
try {
  cases = JSON.parse(Buffer.concat(chunks).toString() || "[]");
} catch (e) {
  process.stderr.write(`bad input json: ${e}`);
  process.exit(2);
}

const failures = [];
for (const { id, src } of cases) {
  try {
    await mermaid.parse(src);
  } catch (e) {
    failures.push({ id, error: String(e && e.message ? e.message : e) });
  }
}
process.stdout.write(JSON.stringify({ failures }));
process.exit(failures.length ? 1 : 0);
```

- [ ] **Step 4: Smoke-test the validator by hand**

Run:
```bash
echo '[{"id":"ok","src":"flowchart TD\n A-->B"},{"id":"bad","src":"flowchart TD\n A--"}]' \
  | node evals/mermaid_check.mjs; echo "exit=$?"
```
Expected: stdout contains `"id":"bad"` in `failures`, `"ok"` absent; `exit=1`.

> If `mermaid.parse` throws about a missing DOM API even with jsdom, add the missing global to the shim (e.g. `globalThis.DOMPurify` is bundled; most commonly only `window`/`document` are needed). Heuristic output is plain `flowchart`/`sequenceDiagram`/`classDiagram`/`erDiagram` text, which parses without rendering.

- [ ] **Step 5: Write the failing test**

`evals/tests/test_validity.py`:

```python
import json
import validity
from validity import check_mermaid, ValidityResult


def test_empty_returns_zero(monkeypatch):
    # No subprocess should be spawned for an empty set.
    def boom(*a, **k):
        raise AssertionError("should not call node")
    monkeypatch.setattr(validity.subprocess, "run", boom)
    assert check_mermaid({}) == ValidityResult(0, 0, [])


def test_parses_node_output(monkeypatch):
    class FakeProc:
        returncode = 1
        stdout = json.dumps({"failures": [{"id": "bad", "error": "Parse error"}]})
        stderr = ""

    monkeypatch.setattr(validity.subprocess, "run", lambda *a, **k: FakeProc())
    res = check_mermaid({"ok": "flowchart TD\n A-->B", "bad": "flowchart TD\n A--"})
    assert res.checked == 2
    assert res.passed == 1
    assert res.failures == [{"id": "bad", "error": "Parse error"}]


def test_node_crash_raises(monkeypatch):
    class FakeProc:
        returncode = 2
        stdout = ""
        stderr = "boom"

    monkeypatch.setattr(validity.subprocess, "run", lambda *a, **k: FakeProc())
    try:
        check_mermaid({"x": "flowchart TD\n A-->B"})
        assert False, "expected RuntimeError"
    except RuntimeError as e:
        assert "boom" in str(e)
```

- [ ] **Step 6: Run test to verify it fails**

Run: `python -m pytest evals/tests/test_validity.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'validity'`

- [ ] **Step 7: Write `evals/validity.py`**

```python
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

_EVALS_DIR = Path(__file__).resolve().parent
_CHECK_JS = _EVALS_DIR / "mermaid_check.mjs"


@dataclass
class ValidityResult:
    checked: int
    passed: int
    failures: list  # [{"id", "error"}]


def check_mermaid(diagrams: dict[str, str]) -> ValidityResult:
    """diagrams: id -> mermaid source. Validates via mermaid_check.mjs."""
    if not diagrams:
        return ValidityResult(0, 0, [])
    payload = json.dumps([{"id": k, "src": v} for k, v in diagrams.items()])
    proc = subprocess.run(
        ["node", str(_CHECK_JS)],
        input=payload,
        capture_output=True,
        text=True,
    )
    if proc.returncode not in (0, 1):
        raise RuntimeError(f"mermaid_check.mjs failed (exit {proc.returncode}): {proc.stderr.strip()}")
    failures = json.loads(proc.stdout)["failures"]
    return ValidityResult(
        checked=len(diagrams),
        passed=len(diagrams) - len(failures),
        failures=failures,
    )
```

- [ ] **Step 8: Run test to verify it passes**

Run: `python -m pytest evals/tests/test_validity.py -v`
Expected: PASS (3 passed)

- [ ] **Step 9: Ignore node_modules**

Append to `.gitignore` (create if missing — repo root):

```
evals/node_modules/
```

- [ ] **Step 10: Commit**

```bash
git add evals/package.json evals/package-lock.json evals/mermaid_check.mjs evals/validity.py evals/tests/test_validity.py .gitignore
git commit -m "feat(evals): parse-only mermaid validator with python wrapper"
```

---

### Task 5: Reporters (tables, markers, badge, results.json)

**Files:**
- Create: `evals/reporters.py`
- Test: `evals/tests/test_reporters.py`

- [ ] **Step 1: Write the failing test**

`evals/tests/test_reporters.py`:

```python
import pytest
from corpus_loader import Case
from scoring import score
from validity import ValidityResult
from reporters import (
    replace_block, badge_dict, render_summary_table, results_dict,
    START, END,
)


def _result():
    cases = [
        Case(id="a", expected="er", source="synthetic", provenance=None,
             files=[{"filename": "a"}], diff_text=""),
        Case(id="b", expected="flow", source="synthetic", provenance=None,
             files=[{"filename": "b"}], diff_text=""),
    ]
    preds = {"a": "er", "b": "flow"}
    return cases, score(cases, lambda f, d: preds[f[0]["filename"]])


def test_replace_block_inserts_between_markers():
    doc = f"intro\n{START}\nOLD\n{END}\noutro\n"
    out = replace_block(doc, "NEW")
    assert f"{START}\nNEW\n{END}" in out
    assert "OLD" not in out
    assert out.startswith("intro")
    assert out.rstrip().endswith("outro")


def test_replace_block_is_idempotent():
    doc = f"{START}\nOLD\n{END}"
    once = replace_block(doc, "NEW")
    assert replace_block(once, "NEW") == once


def test_replace_block_missing_markers_raises():
    with pytest.raises(ValueError, match="marker block not found"):
        replace_block("no markers here", "NEW")


def test_badge_color_thresholds():
    assert badge_dict_from_acc(0.95)["color"] == "brightgreen"
    assert badge_dict_from_acc(0.80)["color"] == "yellowgreen"
    assert badge_dict_from_acc(0.50)["color"] == "orange"


def badge_dict_from_acc(acc):
    from scoring import Result
    return badge_dict(Result(n=1, accuracy=acc, confusion={}, per_class={}, misses=[]))


def test_results_dict_is_deterministic_and_timestamp_free():
    cases, result = _result()
    rd = results_dict(result, ValidityResult(2, 2, []), {"by_source": {"synthetic": 2}})
    assert rd["selection_accuracy"] == 1.0
    assert rd["validity"] == {"checked": 2, "passed": 2}
    # no volatile fields
    assert "timestamp" not in rd and "date" not in rd


def test_summary_table_has_all_labels():
    cases, result = _result()
    table = render_summary_table(result, ValidityResult(2, 2, []))
    for label in ("sequence", "flow", "class", "er", "abstain"):
        assert f"`{label}`" in table
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest evals/tests/test_reporters.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'reporters'`

- [ ] **Step 3: Write `evals/reporters.py`**

```python
from __future__ import annotations

import re

from corpus_loader import LABELS
from scoring import Result
from validity import ValidityResult

START = "<!-- eval:results:start -->"
END = "<!-- eval:results:end -->"
_BLOCK_RE = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)


def _pct(x: float) -> str:
    return f"{round(x * 100)}%"


def replace_block(text: str, inner: str) -> str:
    if not _BLOCK_RE.search(text):
        raise ValueError("marker block not found")
    block = f"{START}\n{inner}\n{END}"
    return _BLOCK_RE.sub(lambda _m: block, text)


def badge_dict(result: Result) -> dict:
    acc = result.accuracy
    color = "brightgreen" if acc >= 0.9 else "yellowgreen" if acc >= 0.75 else "orange"
    return {"schemaVersion": 1, "label": "selection accuracy",
            "message": _pct(acc), "color": color}


def results_dict(result: Result, validity: ValidityResult, corpus_counts: dict) -> dict:
    return {
        "n": result.n,
        "selection_accuracy": round(result.accuracy, 4),
        "validity": {"checked": validity.checked, "passed": validity.passed},
        "per_class": {
            label: {
                "precision": round(m.precision, 4),
                "recall": round(m.recall, 4),
                "f1": round(m.f1, 4),
                "support": m.support,
            }
            for label, m in result.per_class.items()
        },
        "corpus": corpus_counts,
    }


def render_summary_table(result: Result, validity: ValidityResult) -> str:
    lines = [
        f"**Selection accuracy:** {_pct(result.accuracy)} ({result.n} cases)  ",
        f"**Mermaid validity (heuristic):** {validity.passed}/{validity.checked} parse  ",
        "",
        "| Type | Precision | Recall | F1 | Support |",
        "|---|---|---|---|---|",
    ]
    for label in LABELS:
        m = result.per_class[label]
        lines.append(
            f"| `{label}` | {_pct(m.precision)} | {_pct(m.recall)} | {_pct(m.f1)} | {m.support} |"
        )
    return "\n".join(lines)


def render_confusion(result: Result) -> str:
    header = "| actual ↓ / predicted → | " + " | ".join(f"`{l}`" for l in LABELS) + " |"
    sep = "|---" * (len(LABELS) + 1) + "|"
    rows = [header, sep]
    for a in LABELS:
        cells = " | ".join(str(result.confusion[a][p]) for p in LABELS)
        rows.append(f"| `{a}` | {cells} |")
    return "\n".join(rows)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest evals/tests/test_reporters.py -v`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add evals/reporters.py evals/tests/test_reporters.py
git commit -m "feat(evals): reporters for tables, markers, badge, results.json"
```

---

### Task 6: Synthetic corpus

**Files:**
- Create: `evals/corpus/synthetic/er-create-orders.json`
- Create: `evals/corpus/synthetic/class-two-types.json`
- Create: `evals/corpus/synthetic/sequence-handler-client-worker.json`
- Create: `evals/corpus/synthetic/flow-state-branching.json`
- Create: `evals/corpus/synthetic/abstain-docs-only.json`
- Create: `evals/corpus/synthetic/abstain-lockfile.json`
- Create: `evals/corpus/synthetic/abstain-tiny.json`

- [ ] **Step 1: ER case** — `evals/corpus/synthetic/er-create-orders.json`

```json
{
  "id": "er-create-orders",
  "expected": "er",
  "source": "synthetic",
  "provenance": null,
  "files": [{"filename": "migrations/003_orders.sql", "additions": 16, "deletions": 0}],
  "diff_text": "diff --git a/migrations/003_orders.sql b/migrations/003_orders.sql\n+++ b/migrations/003_orders.sql\n+CREATE TABLE orders (\n+  id SERIAL PRIMARY KEY,\n+  user_id INTEGER NOT NULL,\n+  total NUMERIC(10,2) NOT NULL,\n+  FOREIGN KEY (user_id) REFERENCES users(id)\n+);\n+ALTER TABLE users ADD COLUMN last_order_at TIMESTAMP;\n"
}
```

- [ ] **Step 2: Class case** — `evals/corpus/synthetic/class-two-types.json`

```json
{
  "id": "class-two-types",
  "expected": "class",
  "source": "synthetic",
  "provenance": null,
  "files": [
    {"filename": "src/engine/base.ts", "additions": 8, "deletions": 0},
    {"filename": "src/engine/kokoro.ts", "additions": 9, "deletions": 0}
  ],
  "diff_text": "diff --git a/src/engine/base.ts b/src/engine/base.ts\n+++ b/src/engine/base.ts\n+interface TtsEngine {\n+  synthesize(text: string): Promise<Buffer>;\n+}\ndiff --git a/src/engine/kokoro.ts b/src/engine/kokoro.ts\n+++ b/src/engine/kokoro.ts\n+class KokoroEngine implements TtsEngine {\n+  async synthesize(text: string) { return Buffer.from(text); }\n+}\n"
}
```

- [ ] **Step 3: Sequence case** — `evals/corpus/synthetic/sequence-handler-client-worker.json`

```json
{
  "id": "sequence-handler-client-worker",
  "expected": "sequence",
  "source": "synthetic",
  "provenance": null,
  "files": [
    {"filename": "api/routes/orders.ts", "additions": 7, "deletions": 0},
    {"filename": "lib/client/payments.ts", "additions": 6, "deletions": 0},
    {"filename": "workers/fulfilment.ts", "additions": 6, "deletions": 0}
  ],
  "diff_text": "diff --git a/api/routes/orders.ts b/api/routes/orders.ts\n+++ b/api/routes/orders.ts\n+router.post('/orders', async (req, res) => {\n+  const charge = await paymentsClient.charge(req.body);\n+  await queue.publish('fulfil', charge.id);\n+});\ndiff --git a/lib/client/payments.ts b/lib/client/payments.ts\n+++ b/lib/client/payments.ts\n+export async function charge(o) { return fetch('/pay'); }\ndiff --git a/workers/fulfilment.ts b/workers/fulfilment.ts\n+++ b/workers/fulfilment.ts\n+queue.consume('fulfil', async (id) => ship(id));\n"
}
```

- [ ] **Step 4: Flow case** — `evals/corpus/synthetic/flow-state-branching.json`

```json
{
  "id": "flow-state-branching",
  "expected": "flow",
  "source": "synthetic",
  "provenance": null,
  "files": [{"filename": "src/retry.ts", "additions": 14, "deletions": 1}],
  "diff_text": "diff --git a/src/retry.ts b/src/retry.ts\n+++ b/src/retry.ts\n+function step(state) {\n+  if (state === 'idle') return 'running';\n+  if (state === 'running') {\n+    return ok() ? 'done' : 'failed';\n+  }\n+  if (state === 'failed' && retries < max) {\n+    retries++;\n+    return 'running';\n+  }\n+  return state;\n+}\n"
}
```

- [ ] **Step 5: Abstain — docs only** — `evals/corpus/synthetic/abstain-docs-only.json`

```json
{
  "id": "abstain-docs-only",
  "expected": "abstain",
  "source": "synthetic",
  "provenance": null,
  "files": [{"filename": "README.md", "additions": 60, "deletions": 4}],
  "diff_text": "diff --git a/README.md b/README.md\n+++ b/README.md\n+lots of prose changes\n"
}
```

- [ ] **Step 6: Abstain — lockfile** — `evals/corpus/synthetic/abstain-lockfile.json`

```json
{
  "id": "abstain-lockfile",
  "expected": "abstain",
  "source": "synthetic",
  "provenance": null,
  "files": [{"filename": "package-lock.json", "additions": 420, "deletions": 18}],
  "diff_text": "diff --git a/package-lock.json b/package-lock.json\n+++ b/package-lock.json\n+ dependency bumps\n"
}
```

- [ ] **Step 7: Abstain — tiny change** — `evals/corpus/synthetic/abstain-tiny.json`

```json
{
  "id": "abstain-tiny",
  "expected": "abstain",
  "source": "synthetic",
  "provenance": null,
  "files": [{"filename": "src/config.ts", "additions": 3, "deletions": 1}],
  "diff_text": "diff --git a/src/config.ts b/src/config.ts\n+++ b/src/config.ts\n+export const TIMEOUT = 5000;\n"
}
```

- [ ] **Step 8: Verify each case classifies as expected**

Run:
```bash
python - <<'PY'
from pathlib import Path
import sys
sys.path.insert(0, "evals")
from _iago import classify_diagram_type
from corpus_loader import load_corpus
from scoring import normalize
for c in load_corpus(Path("evals/corpus/synthetic")):
    got = normalize(classify_diagram_type(c.files, c.diff_text))
    flag = "OK " if got == c.expected else "XX "
    print(flag, c.id, "->", got, "(expected", c.expected + ")")
PY
```
Expected: every line starts with `OK`. If any `XX`, the synthetic diff isn't hitting the intended rubric branch — adjust the `diff_text`/`files` (not the production code) until it matches. This is the point of synthetic fixtures: they must exercise the real heuristic.

- [ ] **Step 9: Commit**

```bash
git add evals/corpus/synthetic/
git commit -m "test(evals): synthetic corpus covering each rubric branch + abstain"
```

---

### Task 7: Capture helper for real PRs

**Files:**
- Create: `evals/capture.py`
- Test: `evals/tests/test_capture.py`

- [ ] **Step 1: Write the failing test**

`evals/tests/test_capture.py`:

```python
import json
import capture


def test_capture_writes_case(tmp_path, monkeypatch):
    monkeypatch.setattr(capture, "REAL", tmp_path)

    def fake_gh_json(args):
        if args[:2] == ["pr", "view"]:
            return json.dumps({
                "files": [{"path": "migrations/x.sql", "additions": 12, "deletions": 0}],
                "title": "Add table",
                "headRefOid": "abc123",
                "url": "https://github.com/o/r/pull/9",
            })
        return "diff --git a/migrations/x.sql b/migrations/x.sql\n+CREATE TABLE x();"

    monkeypatch.setattr(capture, "gh_json", fake_gh_json)
    capture.capture("o/r", 9, "er", "real-er-x")

    written = json.loads((tmp_path / "real-er-x.json").read_text())
    assert written["expected"] == "er"
    assert written["source"] == "real"
    assert written["provenance"]["pr"] == 9
    assert written["provenance"]["sha"] == "abc123"
    assert written["files"] == [{"filename": "migrations/x.sql", "additions": 12, "deletions": 0}]
    assert "CREATE TABLE" in written["diff_text"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest evals/tests/test_capture.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'capture'`

- [ ] **Step 3: Write `evals/capture.py`**

```python
"""Snapshot a real public PR into corpus/real/<id>.json using the gh CLI.

Usage:
    python evals/capture.py --repo owner/name --pr 123 --expected sequence --id real-seq-foo
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

REAL = Path(__file__).resolve().parent / "corpus" / "real"


def gh_json(args: list[str]) -> str:
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=True).stdout


def capture(repo: str, pr: int, expected: str, case_id: str) -> Path:
    meta = json.loads(gh_json(
        ["pr", "view", str(pr), "--repo", repo, "--json", "files,title,headRefOid,url"]
    ))
    diff = gh_json(["pr", "diff", str(pr), "--repo", repo])
    case = {
        "id": case_id,
        "expected": expected,
        "source": "real",
        "provenance": {"repo": repo, "pr": pr, "sha": meta["headRefOid"], "url": meta["url"]},
        "files": [
            {"filename": f["path"], "additions": f["additions"], "deletions": f["deletions"]}
            for f in meta["files"]
        ],
        "diff_text": diff,
    }
    REAL.mkdir(parents=True, exist_ok=True)
    dest = REAL / f"{case_id}.json"
    dest.write_text(json.dumps(case, indent=2) + "\n")
    print(f"wrote {dest}")
    return dest


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--pr", type=int, required=True)
    ap.add_argument("--expected", required=True, choices=["sequence", "flow", "class", "er", "abstain"])
    ap.add_argument("--id", required=True, dest="case_id")
    a = ap.parse_args(argv)
    capture(a.repo, a.pr, a.expected, a.case_id)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest evals/tests/test_capture.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Capture 3 real PRs to seed `corpus/real/`**

Pick 3 public PRs whose intended type you can eyeball (e.g. a migration PR, a multi-class PR, a handler/worker PR). Example:
```bash
python evals/capture.py --repo prisma/prisma --pr 1 --expected er --id real-er-example
```
Then **verify** each landed where you expect with the Task 6 Step 8 script pointed at `evals/corpus/real`. Re-label or drop any whose production classification you disagree with — record the disagreement in `BENCHMARKS.md` growth notes (these are genuine misses, not corpus bugs).

> If you cannot pick real PRs confidently right now, skip Step 5 and ship with synthetic-only; the real set grows over time. Note this in `BENCHMARKS.md`.

- [ ] **Step 6: Commit**

```bash
git add evals/capture.py evals/tests/test_capture.py evals/corpus/real/ 2>/dev/null || git add evals/capture.py evals/tests/test_capture.py
git commit -m "feat(evals): gh-backed real-PR capture helper + seed cases"
```

---

### Task 8: Driver (`run.py`) with `--check`

**Files:**
- Create: `evals/run.py`
- Create: `evals/thresholds.json`
- Test: `evals/tests/test_run.py`

- [ ] **Step 1: Write `evals/thresholds.json`** (baseline filled in Task 10)

```json
{
  "min_selection_accuracy": 0.0
}
```

- [ ] **Step 2: Write the failing test**

`evals/tests/test_run.py`:

```python
import run


def test_corpus_counts_groups_by_source_and_expected():
    from corpus_loader import Case
    cases = [
        Case(id="a", expected="er", source="synthetic", provenance=None, files=[{"filename": "x"}], diff_text=""),
        Case(id="b", expected="er", source="real", provenance=None, files=[{"filename": "y"}], diff_text=""),
    ]
    counts = run.corpus_counts(cases)
    assert counts["by_source"] == {"synthetic": 1, "real": 1}
    assert counts["by_expected"] == {"er": 2}


def test_build_returns_result_and_validity(monkeypatch):
    from corpus_loader import Case
    from validity import ValidityResult
    cases = [
        Case(id="a", expected="flow", source="synthetic", provenance=None,
             files=[{"filename": "src/x.ts", "additions": 20, "deletions": 0}],
             diff_text="if (x) { y(); } else { z(); }\n" * 3),
    ]
    monkeypatch.setattr(run, "check_mermaid", lambda d: ValidityResult(len(d), len(d), []))
    result, validity = run.build(cases)
    assert result.n == 1
    assert validity.checked == 1  # flow is non-abstain → one diagram generated
```

- [ ] **Step 3: Run test to verify it fails**

Run: `python -m pytest evals/tests/test_run.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'run'`

- [ ] **Step 4: Write `evals/run.py`**

```python
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest evals/tests/test_run.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add evals/run.py evals/thresholds.json evals/tests/test_run.py
git commit -m "feat(evals): driver with --check gate for thresholds and doc drift"
```

---

### Task 9: Publishable docs (BENCHMARKS.md + README markers + badge)

**Files:**
- Create: `BENCHMARKS.md`
- Modify: `README.md` (header badge + new Benchmarks section)

- [ ] **Step 1: Write `BENCHMARKS.md` with the marker block**

```markdown
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
```

> Note: the fenced ```` ```bash ```` blocks inside `BENCHMARKS.md` above are part
> of the file content. When creating the file, keep them as literal triple-backtick
> code fences.

- [ ] **Step 2: Add the badge to the README header**

In `README.md`, modify the centered badge block (the `<p align="center">` with
the Tests/npm/MIT/Bun badges) to add a fifth badge after the Tests badge:

```html
  <a href="https://github.com/drakulavich/iago/blob/main/BENCHMARKS.md"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fdrakulavich%2Fiago%2Fmain%2Fevals%2Fbadge.json" alt="selection accuracy"></a>
```

- [ ] **Step 3: Add a Benchmarks section to the README**

Insert before the `## License` section in `README.md`:

```markdown
## Benchmarks

Iago's diagram-type selection, abstention, and heuristic Mermaid validity are
benchmarked deterministically in CI. Full methodology: [`BENCHMARKS.md`](BENCHMARKS.md).

<!-- eval:results:start -->
_Run `python evals/run.py` to populate._
<!-- eval:results:end -->
```

- [ ] **Step 4: Verify the markers exist in both files**

Run: `grep -c "eval:results:start" BENCHMARKS.md README.md`
Expected: each file reports `1`.

- [ ] **Step 5: Commit**

```bash
git add BENCHMARKS.md README.md
git commit -m "docs: add BENCHMARKS.md, README benchmarks section and accuracy badge"
```

---

### Task 10: Generate artifacts, set baseline, full local gate

**Files:**
- Modify: `evals/thresholds.json`
- Modify: `BENCHMARKS.md`, `README.md`, `evals/badge.json`, `evals/results.json` (generated)

- [ ] **Step 1: Generate the published artifacts**

Run: `python evals/run.py`
Expected: prints `cases=N accuracy=XX.X% validity=K/K`, no `INVALID` lines, and `artifacts updated`. If any `INVALID` line appears, fix `heuristic_diagram` output handling or the validator shim (Task 4 Step 4) before continuing — validity must be 100%.

- [ ] **Step 2: Set the accuracy baseline**

Read the accuracy printed in Step 1. Set `evals/thresholds.json` `min_selection_accuracy` to that value rounded **down** to 2 decimals (so the gate is "don't regress," not "stay perfect"). Example, if accuracy is 92.9%:

```json
{
  "min_selection_accuracy": 0.92
}
```

- [ ] **Step 3: Run the full check gate**

Run: `python evals/run.py --check`
Expected: no `FAIL:` lines; exit code `0` (confirm with `echo $?`). The artifacts you just generated are now in sync, so `--check` is clean.

- [ ] **Step 4: Run the whole harness test suite**

Run: `python -m pytest evals/tests -v`
Expected: all pass.

- [ ] **Step 5: Commit generated artifacts + baseline**

```bash
git add evals/thresholds.json evals/badge.json evals/results.json BENCHMARKS.md README.md
git commit -m "chore(evals): generate baseline results and set accuracy threshold"
```

---

### Task 11: CI integration

**Files:**
- Modify: `.github/workflows/test.yml`

- [ ] **Step 1: Read the current workflow**

Run: `cat .github/workflows/test.yml`
Note the existing `jobs:` keys and the indentation style so the new job matches.

- [ ] **Step 2: Add an `evals` job**

Add under `jobs:` in `.github/workflows/test.yml`:

```yaml
  evals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install eval deps
        run: |
          python -m pip install pytest
          cd evals && npm install
      - name: Harness self-tests
        run: python -m pytest evals/tests -v
      - name: Eval gate
        run: python evals/run.py --check
```

- [ ] **Step 3: Validate the workflow YAML locally**

Run: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/test.yml')); print('yaml ok')"`
Expected: `yaml ok`. (If PyYAML is missing: `python -m pip install pyyaml` first.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: run eval harness tests and --check gate"
```

- [ ] **Step 5: Push and confirm CI is green**

```bash
git push
```
Then confirm the `evals` job passes on the pushed branch:
```bash
gh run list --workflow test.yml --limit 1
gh run watch $(gh run list --workflow test.yml --limit 1 --json databaseId -q '.[0].databaseId')
```
Expected: the `evals` job is green. If it fails on doc-drift, run `python evals/run.py` locally, commit, and push (the runner's regenerated artifacts must match committed ones).

---

## Self-Review

**Spec coverage:**
- Selection + abstention scoring → Tasks 3, 6. ✔
- Mermaid validity (heuristic only) → Task 4 + driver wiring Task 8. ✔
- Hybrid corpus (synthetic + real capture) → Tasks 6, 7. ✔
- `results.json` deterministic, no wall-clock → Task 5 (`results_dict`) + test. ✔
- BENCHMARKS.md + README table + badge → Tasks 5, 9, 10. ✔
- `--check` doubles as threshold gate + drift gate → Task 8 + Task 10/11. ✔
- CI keyless job → Task 11. ✔
- Harness self-tests → Tasks 2–5, 7, 8 (every logic module has tests). ✔
- "What this does NOT measure yet" honesty section → Task 9 (`BENCHMARKS.md`). ✔
- `capture.py` in architecture → Task 7. ✔

**Placeholder scan:** the only `_Run ... to populate._` strings are intentional initial marker-block contents, replaced by Task 10 Step 1. The `test_perfect_score` stub is explicitly removed in Task 3 Step 2 (shown only to flag the anti-pattern). No other TODO/TBD.

**Type consistency:** `Case` fields (`id, expected, source, provenance, files, diff_text`) are identical across loader, scoring, reporters, run, capture tests. `Result` fields (`n, accuracy, confusion, per_class, misses`) and `Metrics` (`precision, recall, f1, support`) and `ValidityResult` (`checked, passed, failures`) are used consistently. Marker constants `START`/`END` defined once in `reporters.py` and imported. Function names stable: `classify_diagram_type`, `heuristic_diagram`, `load_corpus`, `score`, `normalize`, `check_mermaid`, `replace_block`, `badge_dict`, `results_dict`, `render_summary_table`, `render_confusion`, `corpus_counts`, `build`.
