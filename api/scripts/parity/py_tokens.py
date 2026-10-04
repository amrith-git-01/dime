"""Python side of the unsubscribe-token cross-check (see tokens-check.ts).

Reads ``{"secret": str, "cases": [{"op": "sign"|"verify", ...}]}`` on stdin and prints one result per
case as JSON. Uses the real ``features.email.tokens`` module of the Python backend; no network, no DB.

    cd backend && uv run python ../api/scripts/parity/py_tokens.py < cases.json
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.getcwd())

from features.email.tokens import sign_unsubscribe_token, verify_unsubscribe_token  # noqa: E402


def main() -> int:
    payload = json.load(sys.stdin)
    secret = payload["secret"]
    results: list[dict[str, object]] = []
    for case in payload["cases"]:
        if case["op"] == "sign":
            token = sign_unsubscribe_token(
                secret=case.get("secret", secret),
                user_id=case["user_id"],
                kind=case["kind"],
                now_ts=case["now_ts"],
            )
            results.append({"token": token})
        else:
            verified = verify_unsubscribe_token(secret=case.get("secret", secret), token=case["token"], now_ts=case["now_ts"])
            results.append({"result": None if verified is None else {"user_id": verified[0], "kind": verified[1]}})
    json.dump(results, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
