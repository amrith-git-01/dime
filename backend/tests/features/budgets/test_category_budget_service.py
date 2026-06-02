from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from features.budgets.category_budget_schemas import CategoryBudgetUpsertBody
from features.budgets.category_budget_service import CategoryBudgetService

_USER = "user-1"
_CAT = "cat-1"


@pytest.fixture
def service() -> CategoryBudgetService:
    return CategoryBudgetService(supabase=MagicMock())


def test_list_category_budgets_maps_rows(service: CategoryBudgetService) -> None:
    service._repo.list_for_user = MagicMock(
        return_value=[
            {"category_id": _CAT, "monthly_amount": "5000.00"},
        ],
    )
    result = service.list_category_budgets(_USER)
    assert len(result.items) == 1
    assert result.items[0].category_id == _CAT
    assert result.items[0].monthly_amount == "5000.00"


def test_upsert_rejects_invisible_category(service: CategoryBudgetService) -> None:
    service._require_visible_category = MagicMock(  # type: ignore[method-assign]
        side_effect=HTTPException(status_code=404, detail="Category not found."),
    )
    with pytest.raises(HTTPException) as exc:
        service.upsert_category_budget(
            _USER,
            _CAT,
            CategoryBudgetUpsertBody(monthly_amount=Decimal("1000")),
        )
    assert exc.value.status_code == 404


def test_upsert_success(service: CategoryBudgetService) -> None:
    service._require_visible_category = MagicMock()  # type: ignore[method-assign]
    service._repo.upsert = MagicMock(
        return_value={"category_id": _CAT, "monthly_amount": "2500"},
    )
    item = service.upsert_category_budget(
        _USER,
        _CAT,
        CategoryBudgetUpsertBody(monthly_amount=Decimal("2500")),
    )
    assert item.category_id == _CAT
    assert item.monthly_amount == "2500"
