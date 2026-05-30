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
