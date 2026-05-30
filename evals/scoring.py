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
