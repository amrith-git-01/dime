"""Budget read / upsert for the authenticated user."""

from __future__ import annotations

import logging
from calendar import monthrange
from datetime import date

from supabase import Client

from features.budgets.repository import BudgetRepository
from features.budgets.schemas import BudgetGetResponse, BudgetResponse, BudgetUpsertBody

logger = logging.getLogger(__name__)


class BudgetService:
    def __init__(self, supabase: Client) -> None:
        self._repo = BudgetRepository(supabase)

    def get_budget(self, user_id: str) -> BudgetGetResponse:
        row = self._repo.fetch_by_user_id(user_id)
        if row is None:
            return BudgetGetResponse(budget=None)
        return BudgetGetResponse(budget=BudgetResponse.model_validate(row))

    def upsert_budget(self, user_id: str, body: BudgetUpsertBody) -> BudgetResponse:
        today = date.today()
        _, days_in_month = monthrange(today.year, today.month)
        daily_budget = body.amount / days_in_month
        row = self._repo.upsert_monthly(user_id=user_id, amount=body.amount, daily_budget=daily_budget)
        return BudgetResponse.model_validate(row)
