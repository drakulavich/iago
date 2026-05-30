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
