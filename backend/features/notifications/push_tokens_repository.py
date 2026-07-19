from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from supabase import Client


class PushTokensRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def upsert(self, user_id: str, token: str, platform: str) -> dict[str, Any]:
        now = datetime.now(UTC).isoformat()
        res = (
            self._db.table("user_push_tokens")
            .upsert(
                {
                    "user_id": user_id,
                    "expo_push_token": token,
                    "platform": platform,
                    "updated_at": now,
                },
                on_conflict="expo_push_token",
            )
            .execute()
        )
        data = res.data
        if isinstance(data, list) and data and isinstance(data[0], dict):
            return data[0]
        return {
            "user_id": user_id,
            "expo_push_token": token,
            "platform": platform,
        }

    def list_tokens(self, user_id: str) -> list[str]:
        res = (
            self._db.table("user_push_tokens")
            .select("expo_push_token")
            .eq("user_id", user_id)
            .execute()
        )
        rows = res.data if isinstance(res.data, list) else []
        out: list[str] = []
        for row in rows:
            if isinstance(row, dict):
                tok = row.get("expo_push_token")
                if isinstance(tok, str) and tok:
                    out.append(tok)
        return out

    def delete_token(self, user_id: str, token: str) -> None:
        (
            self._db.table("user_push_tokens")
            .delete()
            .eq("user_id", user_id)
            .eq("expo_push_token", token)
            .execute()
        )

    def delete_all_for_user(self, user_id: str) -> None:
        self._db.table("user_push_tokens").delete().eq("user_id", user_id).execute()

    def delete_by_token(self, token: str) -> None:
        self._db.table("user_push_tokens").delete().eq("expo_push_token", token).execute()

