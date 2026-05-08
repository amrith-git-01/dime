"""``public.transactions`` access via Supabase service client."""

from __future__ import annotations

from typing import Any

from supabase import Client


class TransactionRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def list_for_user(self, user_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
        res = (
            self._db.table("transactions")
            .select("*")
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
            .order("transaction_at", desc=True)
            .limit(limit)
            .execute()
        )
        data = res.data
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]

    def insert(self, row: dict[str, Any]) -> dict[str, Any]:
        # postgrest-py: insert() returns SyncQueryRequestBuilder (execute only).
        # Default returning=representation includes the new row in the response.
        res = self._db.table("transactions").insert(row).execute()
        data = res.data
        if not isinstance(data, list) or len(data) == 0:
            msg = "Insert returned no row"
            raise RuntimeError(msg)
        first = data[0]
        if not isinstance(first, dict):
            msg = "Insert returned invalid row"
            raise RuntimeError(msg)
        return first
