"""``Idempotency-Key`` handling (contract C2).

Design
------
* Queued endpoints (receipt / voice / sms) store the key on their ``jobs`` row(s)
  (``unique (user_id, idempotency_key)``). A repeated key returns the original 202 body
  without enqueueing anything or re-uploading media. SMS batches use one derived key per
  message: ``"<key>:<index>"``.
* ``POST /transactions`` (synchronous) claims the key with a ``jobs`` row of kind
  ``manual_create`` (status processing -> done) whose ``result`` is
  ``{"status_code": 201, "body": {...}}``; a repeat returns that stored response. A concurrent
  duplicate gets 409 until the first request finishes; a failed first attempt may be retried.
* Re-using a key with a *different* payload is not detected: the original response is replayed.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from core.errors import ConflictError, DomainValidationError
from features.jobs.repository import JobsRepository

_KEY_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{7,99}$")  # UUIDs fit; 8..100 chars


def parse_idempotency_key(raw: str | None) -> str | None:
    """Return the cleaned key, ``None`` when absent/blank, or raise 422 for a malformed key."""
    if raw is None:
        return None
    key = raw.strip()
    if not key:
        return None
    if not _KEY_RE.fullmatch(key):
        raise DomainValidationError(
            "Invalid Idempotency-Key (use a UUID or 8-100 chars of letters, digits, '-', '_', '.')."
        )
    return key


def derived_keys(key: str, count: int) -> list[str]:
    return [f"{key}:{i}" for i in range(count)]


def run_idempotent(
    repo: JobsRepository,
    *,
    user_id: str,
    key: str,
    kind: str,
    action: Callable[[], dict[str, Any]],
    status_code: int = 201,
) -> tuple[int, dict[str, Any]]:
    """Run ``action`` at most once per ``(user_id, key)``; replays return the stored response."""
    state, row = repo.claim_key(user_id=user_id, kind=kind, key=key)
    if state == "replay":
        stored = row.get("result")
        if isinstance(stored, dict) and isinstance(stored.get("body"), dict):
            return int(stored.get("status_code") or status_code), stored["body"]
        return status_code, {"accepted": True}
    if state == "in_progress":
        raise ConflictError("A request with this Idempotency-Key is still being processed.")
    job_id = str(row["id"])
    try:
        body = action()
    except BaseException as exc:
        repo.mark_failed(job_id, f"{type(exc).__name__}: {exc}")
        raise
    repo.mark_done(job_id, {"status_code": status_code, "body": body})
    return status_code, body
