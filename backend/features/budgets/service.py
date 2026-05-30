"""Budget read / upsert for the authenticated user."""

from __future__ import annotations

import logging
from decimal import Decimal

from supabase import Client

from features.budgets.repository import BudgetRepository
from features.budgets.schemas import BudgetGetResponse, BudgetResponse, BudgetUpsertBody

logger = logging.getLogger(__name__)


def _decimal_from_row(row: dict[str, object], key: str) -> Decimal:
    raw = row.get(key, 0)
    return Decimal(str(raw))


class BudgetService:
    def __init__(self, supabase: Client) -> None:
        self._repo = BudgetRepository(supabase)

    def get_budget(self, user_id: str) -> BudgetGetResponse:
        row = self._repo.fetch_by_user_id(user_id)
        if row is None:
            return BudgetGetResponse(budget=None)
        return BudgetGetResponse(budget=BudgetResponse.model_validate(row))

    def upsert_budget(self, user_id: str, body: BudgetUpsertBody) -> BudgetResponse:
        existing = self._repo.fetch_by_user_id(user_id)
        monthly = _decimal_from_row(existing, "monthly_budget") if existing else Decimal(0)
        daily = _decimal_from_row(existing, "daily_budget") if existing else Decimal(0)

        if body.monthly_amount is not None:
            monthly = body.monthly_amount
        if body.daily_amount is not None:
            daily = body.daily_amount

        row = self._repo.upsert_budget(
            user_id=user_id,
            monthly_budget=monthly,
            daily_budget=daily,
        )
        return BudgetResponse.model_validate(row)
