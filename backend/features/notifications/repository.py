"""``public.notifications`` access via Supabase service client."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from supabase import Client


class NotificationRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def list_for_user(self, user_id: str, *, filter: str) -> list[dict[str, Any]]:
        q = (
            self._db.table("notifications")
            .select("*")
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
        )
        if filter == "unread":
            q = q.is_("read_at", "null")
        elif filter == "read":
            q = q.not_.is_("read_at", "null")

        res = q.execute()
        data = res.data
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]

    def insert_deduped(self, row: dict[str, Any]) -> dict[str, Any] | None:
        user_id = row.get("user_id")
        dedupe_key = row.get("dedupe_key")
        if not isinstance(user_id, str) or not isinstance(dedupe_key, str):
            msg = "insert_deduped requires user_id and dedupe_key"
            raise ValueError(msg)

        existing = (
            self._db.table("notifications")
            .select("id")
            .eq("user_id", user_id)
            .eq("dedupe_key", dedupe_key)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if isinstance(existing.data, list) and existing.data:
            return None

        res = self._db.table("notifications").insert(row).execute()
        data = res.data
        if not isinstance(data, list) or not data:
            return None
        first = data[0]
        return first if isinstance(first, dict) else None

    def mark_read(self, user_id: str, notification_id: str) -> dict[str, Any] | None:
        now = datetime.now(UTC).isoformat()
        res = (
            self._db.table("notifications")
            .update({"read_at": now})
            .eq("user_id", user_id)
            .eq("id", notification_id)
            .is_("deleted_at", "null")
            .execute()
        )
        data = res.data
        if not isinstance(data, list) or not data:
            return None
        first = data[0]
        return first if isinstance(first, dict) else None

    def soft_delete(self, user_id: str, notification_id: str) -> bool:
        now = datetime.now(UTC).isoformat()
        res = (
            self._db.table("notifications")
            .update({"deleted_at": now})
            .eq("user_id", user_id)
            .eq("id", notification_id)
            .is_("deleted_at", "null")
            .execute()
        )
        data = res.data
        return isinstance(data, list) and len(data) > 0

    def count_unread(self, user_id: str) -> int:
        res = (
            self._db.table("notifications")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .is_("read_at", "null")
            .is_("deleted_at", "null")
            .execute()
        )
        count = res.count
        if isinstance(count, int):
            return count
        return 0
