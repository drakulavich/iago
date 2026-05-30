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
