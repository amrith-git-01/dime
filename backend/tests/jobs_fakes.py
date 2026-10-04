"""In-memory stand-ins for ``JobsRepository`` used by job / idempotency / route tests."""

from __future__ import annotations

import itertools
from datetime import UTC, datetime, timedelta
from typing import Any

from features.jobs.repository import JobRecord


class FakeUniqueViolation(Exception):
    code = "23505"


class FakeJobsRepo:
    """Mirrors the public surface of ``JobsRepository`` over a dict."""

    def __init__(self) -> None:
        self.rows: dict[str, dict[str, Any]] = {}
        self._ids = itertools.count(1)
        self.calls: list[tuple[str, Any]] = []

    # -- helpers -------------------------------------------------------------------------------

    def age(self, job_id: str, seconds: int) -> None:
        self.rows[job_id]["updated_at"] = (
            datetime.now(UTC) - timedelta(seconds=seconds)
        ).isoformat()

    def by_status(self, status: str) -> list[dict[str, Any]]:
        return [r for r in self.rows.values() if r["status"] == status]

    # -- JobsRepository surface ----------------------------------------------------------------

    def insert_many(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        keys = {(r["user_id"], r["idempotency_key"]) for r in self.rows.values() if r["idempotency_key"]}
        for row in rows:
            key = row.get("idempotency_key")
            if key and (row["user_id"], key) in keys:
                raise FakeUniqueViolation("duplicate key value violates unique constraint")
        out = []
        for row in rows:
            job_id = f"job-{next(self._ids)}"
            stored = {
                "id": job_id,
                "attempts": 0,
                "status": "pending",
                "result": None,
                "idempotency_key": None,
                "payload": {},
                "updated_at": datetime.now(UTC).isoformat(),
                **row,
            }
            self.rows[job_id] = stored
            out.append(dict(stored))
        return out

    def get(self, job_id: str) -> dict[str, Any] | None:
        row = self.rows.get(job_id)
        return dict(row) if row else None

    def find_by_keys(self, user_id: str, keys: list[str]) -> list[dict[str, Any]]:
        return [
            dict(r)
            for r in self.rows.values()
            if r["user_id"] == user_id and r["idempotency_key"] in keys
        ]

    def claim(self, job_id: str, *, max_attempts: int) -> dict[str, Any] | None:
        row = self.rows.get(job_id)
        if row is None or row["status"] != "pending":
            return None
        if row["attempts"] >= max_attempts:
            row["status"] = "failed"
            return None
        row["status"] = "processing"
        row["attempts"] += 1
        row["updated_at"] = datetime.now(UTC).isoformat()
        return dict(row)

    def mark_done(self, job_id: str, result: dict[str, Any] | None = None) -> None:
        self.rows[job_id].update(status="done", result=result)

    def mark_failed(self, job_id: str, error: str) -> None:
        self.rows[job_id].update(status="failed", last_error=error)

    def release(self, job_id: str, *, eligible_after_seconds: int = 0) -> None:
        row = self.rows[job_id]
        if row["status"] in {"pending", "processing"}:
            row["status"] = "pending"
            self.age(job_id, eligible_after_seconds + 1)
        self.calls.append(("release", job_id))

    def list_recoverable(self, *, kind: str, cutoff_iso: str, limit: int) -> list[dict[str, Any]]:
        rows = [
            dict(r)
            for r in self.rows.values()
            if r["kind"] == kind
            and r["status"] in {"pending", "processing"}
            and r["updated_at"] < cutoff_iso
        ]
        rows.sort(key=lambda r: r["updated_at"])
        return rows[:limit]

    def requeue_stale_processing(self, job_id: str, *, cutoff_iso: str) -> bool:
        row = self.rows[job_id]
        if row["status"] == "processing" and row["updated_at"] < cutoff_iso:
            row["status"] = "pending"
            return True
        return False

    def claim_key(self, *, user_id: str, kind: str, key: str, **_: Any):  # type: ignore[no-untyped-def]
        existing = self.find_by_keys(user_id, [key])
        if not existing:
            row = self.insert_many(
                [{"user_id": user_id, "kind": kind, "status": "processing", "idempotency_key": key}]
            )[0]
            return "new", row
        row = existing[0]
        if row["status"] == "done":
            return "replay", row
        if row["status"] == "failed":
            self.rows[row["id"]]["status"] = "processing"
            return "retry", self.rows[row["id"]]
        return "in_progress", row


def record(row: dict[str, Any]) -> JobRecord:
    return JobRecord.from_row(row)
