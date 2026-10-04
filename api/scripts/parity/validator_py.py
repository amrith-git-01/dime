"""Run the validator corpus through the PYTHON reference validator (backend/features/agent/sql_validator.py).

Usage (from the repo root):

    cd backend && uv run python ../api/scripts/parity/validator_py.py ../api/scripts/parity/validator-corpus.json OUT.json

Writes ``{"<id>": {"ok": bool, "error": str | null, "sql": str}}``. Nothing here touches a database or
the network; it only parses strings.
"""

from __future__ import annotations

import json
import os
import sys

# Run from backend/ (cwd) so `features.*` resolves, whatever the script's own directory is.
sys.path.insert(0, os.getcwd())

from features.agent.sql_validator import validate_select_sql  # noqa: E402


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: validator_py.py CORPUS.json OUT.json", file=sys.stderr)
        return 2
    with open(sys.argv[1], encoding="utf-8") as fh:
        corpus = json.load(fh)
    verdicts: dict[str, dict[str, object]] = {}
    for entry in corpus:
        try:
            result = validate_select_sql(entry["sql"])
            verdicts[str(entry["id"])] = {"ok": result.ok, "error": result.error, "sql": result.sql if result.ok else None}
        except Exception as exc:  # the reference crashing on an input counts as a rejection (the agent would fail closed)
            verdicts[str(entry["id"])] = {"ok": False, "error": f"EXCEPTION {type(exc).__name__}: {str(exc)[:200]}", "sql": None}
    with open(sys.argv[2], "w", encoding="utf-8") as fh:
        json.dump(verdicts, fh, indent=1)
    print(f"python validator: {len(verdicts)} verdicts, {sum(1 for v in verdicts.values() if v['ok'])} accepted")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
