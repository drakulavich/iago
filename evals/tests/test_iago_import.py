from _iago import classify_diagram_type, heuristic_diagram


def test_production_functions_are_callable():
    assert callable(classify_diagram_type)
    assert callable(heuristic_diagram)


def test_classify_abstains_on_trivial_change():
    files = [{"filename": "README.md", "additions": 40, "deletions": 1}]
    assert classify_diagram_type(files, "") is None
