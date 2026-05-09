"""``public.transactions`` access via Supabase service client."""

from __future__ import annotations

from typing import Any

from supabase import Client

# Embed category fields via PostgREST FK so callers can render without a separate lookup.
_SELECT_WITH_EMBED = "*,categories(id,name,emoji,color)"


class TransactionRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def list_for_user(self, user_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
        res = (
            self._db.table("transactions")
            .select(_SELECT_WITH_EMBED)
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

    def list_for_user_paginated(
        self,
        user_id: str,
        *,
        from_iso: str | None = None,
        to_iso: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], bool]:
        """Return up to ``limit`` rows and whether more rows exist after this page."""
        fetch_n = limit + 1
        q = (
            self._db.table("transactions")
            .select(_SELECT_WITH_EMBED)
            .eq("user_id", user_id)
            .is_("deleted_at", "null")
        )
        if from_iso is not None:
            q = q.gte("transaction_at", from_iso)
        if to_iso is not None:
            q = q.lte("transaction_at", to_iso)
        end = offset + fetch_n - 1
        res = q.order("transaction_at", desc=True).range(offset, end).execute()
        data = res.data
        if not isinstance(data, list):
            return [], False
        rows = [row for row in data if isinstance(row, dict)]
        has_more = len(rows) > limit
        if has_more:
            rows = rows[:limit]
        return rows, has_more

    def iter_amount_type_category(
        self,
        user_id: str,
        *,
        from_iso: str | None = None,
        to_iso: str | None = None,
        page_size: int = 1000,
    ) -> list[dict[str, Any]]:
        """Load amount, type, category_id for aggregation (paged)."""
        all_rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            q = (
                self._db.table("transactions")
                .select("amount,type,category_id")
                .eq("user_id", user_id)
                .is_("deleted_at", "null")
            )
            if from_iso is not None:
                q = q.gte("transaction_at", from_iso)
            if to_iso is not None:
                q = q.lte("transaction_at", to_iso)
            res = q.order("transaction_at", desc=True).range(offset, offset + page_size - 1).execute()
            data = res.data
            if not isinstance(data, list):
                break
            chunk = [r for r in data if isinstance(r, dict)]
            if not chunk:
                break
            all_rows.extend(chunk)
            if len(chunk) < page_size:
                break
            offset += page_size
        return all_rows

    def fetch_categories_by_ids(self, ids: set[str]) -> dict[str, dict[str, Any]]:
        if not ids:
            return {}
        res = self._db.table("categories").select("id,name,emoji,color").in_("id", list(ids)).execute()
        data = res.data
        if not isinstance(data, list):
            return {}
        out: dict[str, dict[str, Any]] = {}
        for row in data:
            if not isinstance(row, dict):
                continue
            cid = row.get("id")
            if isinstance(cid, str):
                out[cid] = row
        return out

    def insert(self, row: dict[str, Any]) -> dict[str, Any]:
        res = self._db.table("transactions").insert(row).execute()
        data = res.data
        if not isinstance(data, list) or len(data) == 0:
            msg = "Insert returned no row"
            raise RuntimeError(msg)
        first = data[0]
        if not isinstance(first, dict):
            msg = "Insert returned invalid row"
            raise RuntimeError(msg)
        return self.fetch_with_embed(first["id"]) or first

    def fetch_with_embed(self, transaction_id: str) -> dict[str, Any] | None:
        res = (
            self._db.table("transactions")
            .select(_SELECT_WITH_EMBED)
            .eq("id", transaction_id)
            .limit(1)
            .execute()
        )
        data = res.data
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            return None
        return data[0]
