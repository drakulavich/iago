from corpus_loader import Case
from scoring import score, normalize


def test_normalize_maps_none_to_abstain():
    assert normalize(None) == "abstain"
    assert normalize("flow") == "flow"


def test_accuracy_and_confusion():
    def classify(files, diff):
        return {"a": "er", "b": "flow", "c": "flow"}[files[0]["filename"]]

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
