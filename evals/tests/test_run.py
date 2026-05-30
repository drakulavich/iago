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
