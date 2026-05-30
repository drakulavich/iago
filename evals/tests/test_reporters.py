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
