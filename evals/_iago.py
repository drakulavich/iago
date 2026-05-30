"""Load the production diagram functions under test, without re-implementing them.

Imports `action/scripts/run.py` as a module so the eval benchmarks the exact
code that ships. run.py guards its CLI behind `if __name__ == "__main__"`, so
importing it has no side effects beyond defining functions and regex constants.
"""
import importlib.util
from pathlib import Path

_RUN_PY = Path(__file__).resolve().parents[1] / "action" / "scripts" / "run.py"


def _load():
    spec = importlib.util.spec_from_file_location("iago_run", _RUN_PY)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load iago run.py from {_RUN_PY}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_mod = _load()
classify_diagram_type = _mod.classify_diagram_type
heuristic_diagram = _mod.heuristic_diagram
