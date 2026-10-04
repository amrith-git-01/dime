from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from supabase import Client

from core.db_errors import is_unique_violation

logger = logging.getLogger(__name__)

EmailKind = Literal["welcome", "weekly", "monthly"]
EmailStatus = Literal["pending", "sent"]

PENDING_RECLAIM_AFTER = timedelta(minutes=30)


class EmailSendsRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def try_begin(
        self,
        *,
        user_id: str,
        kind: EmailKind,
        period_key: str,
    ) -> bool:
        """Claim the send. ``False`` only if another worker already holds / finished it.

        Only a unique violation (Postgres 23505 / PostgREST 409) means "already claimed";
        any other error propagates. A ``pending`` row older than ``PENDING_RECLAIM_AFTER``
        (process died between claim and send) is re-claimed.
        """
        now = datetime.now(UTC)
        try:
            self._db.table("email_sends").insert(
                {
                    "user_id": user_id,
                    "kind": kind,
                    "period_key": period_key,
                    "status": "pending",
                    "claimed_at": now.isoformat(),
                }
            ).execute()
        except Exception as exc:
            if not is_unique_violation(exc):
                raise
            return self._reclaim_stale_pending(
                user_id=user_id, kind=kind, period_key=period_key, now=now
            )
        return True

    def _reclaim_stale_pending(
        self,
        *,
        user_id: str,
        kind: EmailKind,
        period_key: str,
        now: datetime,
    ) -> bool:
        cutoff = (now - PENDING_RECLAIM_AFTER).isoformat()
        res = (
            self._db.table("email_sends")
            .update({"claimed_at": now.isoformat()})
            .eq("user_id", user_id)
            .eq("kind", kind)
            .eq("period_key", period_key)
            .eq("status", "pending")
            .lt("claimed_at", cutoff)
            .execute()
        )
        reclaimed = isinstance(res.data, list) and len(res.data) > 0
        logger.info(
            "email_sends begin %s user=%s kind=%s period=%s",
            "reclaimed stale pending" if reclaimed else "skipped (already claimed)",
            user_id,
            kind,
            period_key,
        )
        return reclaimed

    def mark_sent(self, *, user_id: str, kind: EmailKind, period_key: str, message_id: str | None) -> None:
        self._db.table("email_sends").update(
            {
                "status": "sent",
                "sent_at": datetime.now(UTC).isoformat(),
                "brevo_message_id": message_id,
            }
        ).eq("user_id", user_id).eq("kind", kind).eq("period_key", period_key).execute()

    def delete_pending(self, *, user_id: str, kind: EmailKind, period_key: str) -> None:
        self._db.table("email_sends").delete().eq("user_id", user_id).eq(
            "kind", kind
        ).eq("period_key", period_key).eq("status", "pending").execute()

    def list_settings_for_digest(self, kind: Literal["weekly", "monthly"]) -> list[dict[str, Any]]:
        column = "weekly_email_enabled" if kind == "weekly" else "monthly_email_enabled"
        res = (
            self._db.table("user_settings")
            .select(f"user_id,{column}")
            .eq(column, True)
            .execute()
        )
        data = res.data
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]

    def fetch_user_email_name(self, user_id: str) -> tuple[str | None, str | None]:
        res = (
            self._db.table("users")
            .select("email,username")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        data = res.data if res is not None else None
        if not isinstance(data, dict):
            return None, None
        email = data.get("email")
        username = data.get("username")
        return (
            email if isinstance(email, str) and email.strip() else None,
            username if isinstance(username, str) and username.strip() else None,
        )
