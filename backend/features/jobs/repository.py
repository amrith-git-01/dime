"""``public.jobs`` access via the Supabase service client (durable queue + idempotency records)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from supabase import Client

from core.db_errors import is_unique_violation

JobStatus = Literal["pending", "processing", "done", "failed"]
JobKind = Literal["receipt", "voice", "sms", "manual_create"]


def _now() -> datetime:
    return datetime.now(UTC)


@dataclass(slots=True, frozen=True)
class JobRecord:
    id: str
    user_id: str
    kind: str
    payload: dict[str, Any]
    status: str
    attempts: int
    idempotency_key: str | None = None
    result: dict[str, Any] | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> JobRecord:
        payload = row.get("payload")
        result = row.get("result")
        return cls(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            kind=str(row["kind"]),
            payload=payload if isinstance(payload, dict) else {},
            status=str(row.get("status") or "pending"),
            attempts=int(row.get("attempts") or 0),
            idempotency_key=row.get("idempotency_key"),
            result=result if isinstance(result, dict) else None,
        )


def _rows(data: object) -> list[dict[str, Any]]:
    if not isinstance(data, list):
        return []
    return [row for row in data if isinstance(row, dict)]


class JobsRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def _table(self) -> Any:
        return self._db.table("jobs")

    # -- create / read -------------------------------------------------------------------------

    def insert_many(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Insert in one statement (all or nothing). Raises on unique violation."""
        res = self._table().insert(rows).execute()
        return _rows(res.data)

    def get(self, job_id: str) -> dict[str, Any] | None:
        res = self._table().select("*").eq("id", job_id).limit(1).execute()
        rows = _rows(res.data)
        return rows[0] if rows else None

    def find_by_keys(self, user_id: str, keys: list[str]) -> list[dict[str, Any]]:
        if not keys:
            return []
        res = (
            self._table()
            .select("*")
            .eq("user_id", user_id)
            .in_("idempotency_key", keys)
            .execute()
        )
        return _rows(res.data)

    # -- state transitions ---------------------------------------------------------------------

    def claim(self, job_id: str, *, max_attempts: int) -> dict[str, Any] | None:
        """pending -> processing (attempts + 1). ``None`` if someone else holds it or it is spent."""
        row = self.get(job_id)
        if row is None or row.get("status") != "pending":
            return None
        attempts = int(row.get("attempts") or 0)
        if attempts >= max_attempts:
            self.mark_failed(job_id, "max attempts exceeded")
            return None
        res = (
            self._table()
            .update(
                {
                    "status": "processing",
                    "attempts": attempts + 1,
                    "updated_at": _now().isoformat(),
                }
            )
            .eq("id", job_id)
            .eq("status", "pending")
            .execute()
        )
        rows = _rows(res.data)
        return rows[0] if rows else None

    def mark_done(self, job_id: str, result: dict[str, Any] | None = None) -> None:
        self._table().update(
            {"status": "done", "result": result, "updated_at": _now().isoformat()}
        ).eq("id", job_id).execute()

    def mark_failed(self, job_id: str, error: str) -> None:
        self._table().update(
            {"status": "failed", "last_error": error[:500], "updated_at": _now().isoformat()}
        ).eq("id", job_id).execute()

    def release(self, job_id: str, *, eligible_after_seconds: int = 0) -> None:
        """Hand a job back to ``pending`` (graceful shutdown) so recovery picks it up at once."""
        stamp = _now() - timedelta(seconds=eligible_after_seconds + 1)
        self._table().update(
            {"status": "pending", "updated_at": stamp.isoformat()}
        ).eq("id", job_id).in_("status", ["pending", "processing"]).execute()

    # -- recovery ------------------------------------------------------------------------------

    def list_recoverable(self, *, kind: str, cutoff_iso: str, limit: int) -> list[dict[str, Any]]:
        res = (
            self._table()
            .select("*")
            .eq("kind", kind)
            .in_("status", ["pending", "processing"])
            .lt("updated_at", cutoff_iso)
            .order("updated_at", desc=False)
            .limit(limit)
            .execute()
        )
        return _rows(res.data)

    def requeue_stale_processing(self, job_id: str, *, cutoff_iso: str) -> bool:
        res = (
            self._table()
            .update({"status": "pending", "updated_at": _now().isoformat()})
            .eq("id", job_id)
            .eq("status", "processing")
            .lt("updated_at", cutoff_iso)
            .execute()
        )
        return bool(_rows(res.data))

    # -- idempotency for synchronous endpoints -------------------------------------------------

    def claim_key(
        self,
        *,
        user_id: str,
        kind: str,
        key: str,
        stale_after_seconds: int = 600,
    ) -> tuple[Literal["new", "replay", "in_progress", "retry"], dict[str, Any]]:
        """Claim ``(user_id, key)`` for a synchronous request.

        ``new``: row inserted (status processing); run the action.
        ``replay``: a finished row exists; return its stored response.
        ``retry``: a failed (or long-stale) row was re-claimed; run the action again.
        ``in_progress``: another request is running it right now.
        """
        try:
            rows = self.insert_many(
                [
                    {
                        "user_id": user_id,
                        "kind": kind,
                        "payload": {},
                        "status": "processing",
                        "attempts": 1,
                        "idempotency_key": key,
                    }
                ]
            )
            if rows:
                return "new", rows[0]
        except Exception as exc:
            if not is_unique_violation(exc):
                raise
        existing_rows = self.find_by_keys(user_id, [key])
        if not existing_rows:  # deleted between insert and lookup: let the caller retry
            return "in_progress", {}
        existing = existing_rows[0]
        status = existing.get("status")
        if status == "done":
            return "replay", existing
        stale_cutoff = (_now() - timedelta(seconds=stale_after_seconds)).isoformat()
        query = (
            self._table()
            .update({"status": "processing", "updated_at": _now().isoformat()})
            .eq("id", existing["id"])
        )
        if status == "failed":
            query = query.eq("status", "failed")
        else:
            query = query.eq("status", status).lt("updated_at", stale_cutoff)
        reclaimed = _rows(query.execute().data)
        if reclaimed:
            return "retry", reclaimed[0]
        return "in_progress", existing
