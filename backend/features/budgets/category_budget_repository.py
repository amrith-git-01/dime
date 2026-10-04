"""``public.category_budgets`` access via Supabase service client."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from supabase import Client

_SELECT = "id,user_id,category_id,monthly_amount,created_at,updated_at"


class CategoryBudgetRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def list_for_user(self, user_id: str) -> list[dict[str, Any]]:
        res = (
            self._db.table("category_budgets")
            .select(_SELECT)
            .eq("user_id", user_id)
            .execute()
        )
        data = res.data
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]

    def fetch_for_category(
        self,
        user_id: str,
        category_id: str,
    ) -> dict[str, Any] | None:
        res = (
            self._db.table("category_budgets")
            .select(_SELECT)
            .eq("user_id", user_id)
            .eq("category_id", category_id)
            .maybe_single()
            .execute()
        )
        if res is None:
            return None
        data = res.data
        return data if isinstance(data, dict) else None

    def upsert(
        self,
        *,
        user_id: str,
        category_id: str,
        monthly_amount: Decimal,
    ) -> dict[str, Any]:
        payload = {
            "user_id": user_id,
            "category_id": category_id,
            "monthly_amount": str(monthly_amount),
        }
        self._db.table("category_budgets").upsert(
            payload,
            on_conflict="user_id,category_id",
        ).execute()
        row = self.fetch_for_category(user_id, category_id)
        if isinstance(row, dict):
            return row
        msg = "Category budget upsert succeeded but could not fetch row."
        raise RuntimeError(msg)

    def delete(self, *, user_id: str, category_id: str) -> None:
        self._db.table("category_budgets").delete().eq("user_id", user_id).eq(
            "category_id",
            category_id,
        ).execute()
