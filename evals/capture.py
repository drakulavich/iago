"""Snapshot a real public PR into corpus/real/<id>.json using the gh CLI.

Usage:
    python evals/capture.py --repo owner/name --pr 123 --expected sequence --id real-seq-foo
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

REAL = Path(__file__).resolve().parent / "corpus" / "real"


def gh_json(args: list[str]) -> str:
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=True).stdout


def capture(repo: str, pr: int, expected: str, case_id: str) -> Path:
    meta = json.loads(gh_json(
        ["pr", "view", str(pr), "--repo", repo, "--json", "files,title,headRefOid,url"]
    ))
    diff = gh_json(["pr", "diff", str(pr), "--repo", repo])
    case = {
        "id": case_id,
        "expected": expected,
        "source": "real",
        "provenance": {"repo": repo, "pr": pr, "sha": meta["headRefOid"], "url": meta["url"]},
        "files": [
            {"filename": f["path"], "additions": f["additions"], "deletions": f["deletions"]}
            for f in meta["files"]
        ],
        "diff_text": diff,
    }
    REAL.mkdir(parents=True, exist_ok=True)
    dest = REAL / f"{case_id}.json"
    dest.write_text(json.dumps(case, indent=2) + "\n")
    print(f"wrote {dest}")
    return dest


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--pr", type=int, required=True)
    ap.add_argument("--expected", required=True, choices=["sequence", "flow", "class", "er", "abstain"])
    ap.add_argument("--id", required=True, dest="case_id")
    a = ap.parse_args(argv)
    capture(a.repo, a.pr, a.expected, a.case_id)


if __name__ == "__main__":
    main()
