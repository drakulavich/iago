from _iago import classify_diagram_type, heuristic_diagram


def test_production_functions_are_callable():
    assert callable(classify_diagram_type)
    assert callable(heuristic_diagram)


def test_classify_abstains_on_trivial_change():
    files = [{"filename": "README.md", "additions": 40, "deletions": 1}]
    assert classify_diagram_type(files, "") is None


def test_heuristic_er_strips_numeric_migration_prefix():
    # Mermaid rejects entity names starting with a digit; a migration like
    # 003_orders.sql must not yield `003_ORDERS`.
    out = heuristic_diagram("er", [{"filename": "migrations/003_orders.sql",
                                    "additions": 12, "deletions": 0}])
    assert "ORDERS" in out
    assert "003_ORDERS" not in out
    # no entity identifier token starts with a digit
    import re
    assert not re.search(r"(?m)^\s*\d", out)
