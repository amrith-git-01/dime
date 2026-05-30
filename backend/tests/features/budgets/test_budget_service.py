from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from features.budgets.schemas import BudgetUpsertBody
from features.budgets.service import BudgetService

_USER = "user-1"
_ROW = {
    "id": "budget-1",
    "user_id": _USER,
    "monthly_budget": "25000",
    "daily_budget": "500",
    "created_at": "2026-01-01T00:00:00",
    "updated_at": "2026-01-02T00:00:00",
}


@pytest.fixture
def service() -> BudgetService:
    return BudgetService(supabase=MagicMock())


def test_upsert_monthly_only_preserves_daily(service: BudgetService) -> None:
    service._repo.fetch_by_user_id = MagicMock(return_value=dict(_ROW))
    service._repo.upsert_budget = MagicMock(return_value=dict(_ROW))

    service.upsert_budget(_USER, BudgetUpsertBody(monthly_amount=Decimal("30000")))

    service._repo.upsert_budget.assert_called_once_with(
        user_id=_USER,
        monthly_budget=Decimal("30000"),
        daily_budget=Decimal("500"),
    )


def test_upsert_daily_only_preserves_monthly(service: BudgetService) -> None:
    service._repo.fetch_by_user_id = MagicMock(return_value=dict(_ROW))
    service._repo.upsert_budget = MagicMock(return_value=dict(_ROW))

    service.upsert_budget(_USER, BudgetUpsertBody(daily_amount=Decimal("800")))

    service._repo.upsert_budget.assert_called_once_with(
        user_id=_USER,
        monthly_budget=Decimal("25000"),
        daily_budget=Decimal("800"),
    )


def test_upsert_create_monthly_only(service: BudgetService) -> None:
    service._repo.fetch_by_user_id = MagicMock(return_value=None)
    created = dict(_ROW)
    created["daily_budget"] = "0"
    service._repo.upsert_budget = MagicMock(return_value=created)

    service.upsert_budget(_USER, BudgetUpsertBody(monthly_amount=Decimal("25000")))

    service._repo.upsert_budget.assert_called_once_with(
        user_id=_USER,
        monthly_budget=Decimal("25000"),
        daily_budget=Decimal(0),
    )


def test_upsert_create_daily_only(service: BudgetService) -> None:
    service._repo.fetch_by_user_id = MagicMock(return_value=None)
    created = dict(_ROW)
    created["monthly_budget"] = "0"
    service._repo.upsert_budget = MagicMock(return_value=created)

    service.upsert_budget(_USER, BudgetUpsertBody(daily_amount=Decimal("500")))

    service._repo.upsert_budget.assert_called_once_with(
        user_id=_USER,
        monthly_budget=Decimal(0),
        daily_budget=Decimal("500"),
    )


def test_upsert_body_requires_at_least_one_field() -> None:
    with pytest.raises(ValueError, match="At least one"):
        BudgetUpsertBody()
