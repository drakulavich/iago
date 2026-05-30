from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

_EVALS_DIR = Path(__file__).resolve().parent
_CHECK_JS = _EVALS_DIR / "mermaid_check.mjs"


@dataclass
class ValidityResult:
    checked: int
    passed: int
    failures: list  # [{"id", "error"}]


def check_mermaid(diagrams: dict[str, str]) -> ValidityResult:
    """diagrams: id -> mermaid source. Validates via mermaid_check.mjs."""
    if not diagrams:
        return ValidityResult(0, 0, [])
    payload = json.dumps([{"id": k, "src": v} for k, v in diagrams.items()])
    proc = subprocess.run(
        ["node", str(_CHECK_JS)],
        input=payload,
        capture_output=True,
        text=True,
    )
    if proc.returncode not in (0, 1):
        raise RuntimeError(f"mermaid_check.mjs failed (exit {proc.returncode}): {proc.stderr.strip()}")
    failures = json.loads(proc.stdout)["failures"]
    return ValidityResult(
        checked=len(diagrams),
        passed=len(diagrams) - len(failures),
        failures=failures,
    )
