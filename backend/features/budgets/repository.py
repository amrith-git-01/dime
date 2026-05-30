"""``public.budgets`` access via Supabase service client (scoped by ``user_id`` in callers)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from supabase import Client

_SELECT = "id,user_id,monthly_budget,daily_budget,created_at,updated_at"


class BudgetRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def fetch_by_user_id(self, user_id: str) -> dict[str, Any] | None:
        res = (
            self._db.table("budgets")
            .select(_SELECT)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if res is None:
            return None
        data = res.data
        return data if isinstance(data, dict) else None

    def upsert_budget(
        self,
        *,
        user_id: str,
        monthly_budget: Decimal,
        daily_budget: Decimal,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "user_id": user_id,
            "monthly_budget": str(monthly_budget),
            "daily_budget": str(daily_budget),
        }
        self._db.table("budgets").upsert(payload, on_conflict="user_id").execute()

        row = self.fetch_by_user_id(user_id)
        if isinstance(row, dict):
            return row

        msg = "Budget upsert succeeded but could not fetch row."
        raise RuntimeError(msg)
