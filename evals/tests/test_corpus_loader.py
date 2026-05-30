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
