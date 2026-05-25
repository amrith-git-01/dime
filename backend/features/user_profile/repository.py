"""``public.users`` access via Supabase service client."""

from __future__ import annotations

from typing import Any

from supabase import Client


class UserProfileRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def fetch_by_id(self, user_id: str) -> dict[str, Any] | None:
        res = (
            self._db.table("users")
            .select("id,username,avatar_url,currency")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if res is None:
            return None
        data = res.data
        return data if isinstance(data, dict) else None

    def upsert_profile(
        self,
        *,
        user_id: str,
        username: str,
        currency: str,
        avatar_url: str | None,
    ) -> None:
        row: dict[str, str] = {"id": user_id, "username": username, "currency": currency}
        if avatar_url is not None:
            row["avatar_url"] = avatar_url
        self._db.table("users").upsert(row, on_conflict="id").execute()
