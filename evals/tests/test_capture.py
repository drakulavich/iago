import json
import capture


def test_capture_writes_case(tmp_path, monkeypatch):
    monkeypatch.setattr(capture, "REAL", tmp_path)

    def fake_gh_json(args):
        if args[:2] == ["pr", "view"]:
            return json.dumps({
                "files": [{"path": "migrations/x.sql", "additions": 12, "deletions": 0}],
                "title": "Add table",
                "headRefOid": "abc123",
                "url": "https://github.com/o/r/pull/9",
            })
        return "diff --git a/migrations/x.sql b/migrations/x.sql\n+CREATE TABLE x();"

    monkeypatch.setattr(capture, "gh_json", fake_gh_json)
    capture.capture("o/r", 9, "er", "real-er-x")

    written = json.loads((tmp_path / "real-er-x.json").read_text())
    assert written["expected"] == "er"
    assert written["source"] == "real"
    assert written["provenance"]["pr"] == 9
    assert written["provenance"]["sha"] == "abc123"
    assert written["files"] == [{"filename": "migrations/x.sql", "additions": 12, "deletions": 0}]
    assert "CREATE TABLE" in written["diff_text"]
