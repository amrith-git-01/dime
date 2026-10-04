"""B4 (reassign column) and C1 (PATCH /categories with budget_amount)."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from core.errors import ConflictError, NotFoundError
from features.categories.repository import CategoryRepository
from features.categories.schemas import UpdateCategoryRequest
from features.categories.service import CategoryService

_USER = "user-1"
_CAT = "cat-1"
_ROW = {
    "id": _CAT,
    "name": "Snacks",
    "icon_name": "Tag",
    "color": "#94A3B8",
    "is_system": False,
    "created_at": "2026-01-01T00:00:00Z",
    "user_id": _USER,
}


# -- B4 ----------------------------------------------------------------------------------------


def test_reassign_only_writes_category_id_column() -> None:
    db = MagicMock()
    CategoryRepository(db).reassign_transactions_category(
        user_id=_USER, from_category_id="a", to_category_id="b"
    )
    db.table.assert_called_once_with("transactions")
    update = db.table.return_value.update
    update.assert_called_once_with({"category_id": "b"})
    chain = update.return_value.eq.return_value.eq.return_value.is_
    chain.assert_called_once_with("deleted_at", "null")


# -- C1 schema: absent vs null vs value --------------------------------------------------------


def test_budget_amount_absent_is_not_a_budget_change() -> None:
    body = UpdateCategoryRequest.model_validate({"name": "Food"})
    assert body.has_budget_change is False
    assert body.budget_amount is None


def test_budget_amount_null_is_a_removal() -> None:
    body = UpdateCategoryRequest.model_validate({"budget_amount": None})
    assert body.has_budget_change is True
    assert body.budget_amount is None


@pytest.mark.parametrize("raw", ["500.00", 500, 500.5, "0"])
def test_budget_amount_accepts_strings_and_numbers(raw: object) -> None:
    body = UpdateCategoryRequest.model_validate({"budget_amount": raw})
    assert body.has_budget_change is True
    assert body.budget_amount == Decimal(str(raw))


@pytest.mark.parametrize("raw", ["-1", "NaN", "Infinity", "abc", "1.234"])
def test_budget_amount_rejects_invalid(raw: object) -> None:
    with pytest.raises(ValidationError):
        UpdateCategoryRequest.model_validate({"budget_amount": raw})


def test_empty_body_is_rejected() -> None:
    with pytest.raises(ValidationError):
        UpdateCategoryRequest.model_validate({})


def test_name_stays_validated_when_present() -> None:
    with pytest.raises(ValidationError):
        UpdateCategoryRequest.model_validate({"name": ""})
    with pytest.raises(ValidationError):
        UpdateCategoryRequest.model_validate({"name": "x" * 41})


def test_budget_only_body_is_valid() -> None:
    body = UpdateCategoryRequest.model_validate({"budget_amount": "500.00"})
    assert body.name is None and body.icon_name is None and body.color is None


# -- C1 service --------------------------------------------------------------------------------


@pytest.fixture
def service() -> CategoryService:
    return CategoryService(supabase=MagicMock())


def test_patch_without_budget_key_uses_plain_update_and_never_touches_budget(
    service: CategoryService,
) -> None:
    service._repo.fetch_by_id_for_user = MagicMock(return_value=dict(_ROW))
    service._repo.list_for_user = MagicMock(return_value=[])
    service._repo.update_custom_category = MagicMock(return_value=dict(_ROW))
    service._repo.update_category_with_budget = MagicMock()

    result = service.update_custom_category(_USER, _CAT, UpdateCategoryRequest(name="Snacks"))

    service._repo.update_category_with_budget.assert_not_called()
    kwargs = service._repo.update_custom_category.call_args.kwargs
    # Absent icon/color keep their current values rather than resetting to defaults.
    assert kwargs["icon_name"] == "Tag"
    assert kwargs["color"] == "#94A3B8"
    assert result.budget_amount is None


def test_patch_with_budget_calls_atomic_rpc_with_upsert(service: CategoryService) -> None:
    service._repo.fetch_by_id_for_user = MagicMock(return_value=dict(_ROW))
    service._repo.list_for_user = MagicMock(return_value=[])
    service._repo.update_category_with_budget = MagicMock(
        return_value={"category": dict(_ROW), "monthly_amount": 500}
    )
    service._repo.update_custom_category = MagicMock()

    result = service.update_custom_category(
        _USER, _CAT, UpdateCategoryRequest.model_validate({"name": "Snacks", "budget_amount": "500"})
    )

    service._repo.update_custom_category.assert_not_called()
    service._repo.update_category_with_budget.assert_called_once_with(
        user_id=_USER,
        category_id=_CAT,
        name="Snacks",
        icon_name=None,
        color=None,
        set_budget=True,
        budget_amount=Decimal("500"),
    )
    assert result.budget_amount == "500.00"


def test_patch_with_null_budget_deletes_it(service: CategoryService) -> None:
    service._repo.fetch_by_id_for_user = MagicMock(return_value=dict(_ROW))
    service._repo.update_category_with_budget = MagicMock(
        return_value={"category": dict(_ROW), "monthly_amount": None}
    )
    result = service.update_custom_category(
        _USER, _CAT, UpdateCategoryRequest.model_validate({"budget_amount": None})
    )
    kwargs = service._repo.update_category_with_budget.call_args.kwargs
    assert kwargs["set_budget"] is True and kwargs["budget_amount"] is None
    assert kwargs["name"] is None
    assert result.budget_amount is None


def test_budget_only_patch_is_allowed_on_system_category(service: CategoryService) -> None:
    system = {**_ROW, "is_system": True, "user_id": None}
    service._repo.fetch_by_id_for_user = MagicMock(return_value=system)
    service._repo.update_category_with_budget = MagicMock(
        return_value={"category": system, "monthly_amount": 100}
    )
    result = service.update_custom_category(
        _USER, _CAT, UpdateCategoryRequest.model_validate({"budget_amount": "100"})
    )
    assert result.budget_amount == "100.00"


def test_renaming_system_category_stays_forbidden(service: CategoryService) -> None:
    service._repo.fetch_by_id_for_user = MagicMock(return_value={**_ROW, "is_system": True})
    with pytest.raises(HTTPException) as exc:
        service.update_custom_category(
            _USER, _CAT, UpdateCategoryRequest.model_validate({"name": "New", "budget_amount": "1"})
        )
    assert exc.value.status_code == 403


class _PgError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__({"code": code})
        self.code = code


def test_rpc_errors_map_to_domain_errors(service: CategoryService) -> None:
    service._repo.fetch_by_id_for_user = MagicMock(return_value=dict(_ROW))
    body = UpdateCategoryRequest.model_validate({"budget_amount": "5"})

    service._repo.update_category_with_budget = MagicMock(side_effect=_PgError("P0002"))
    with pytest.raises(NotFoundError):
        service.update_custom_category(_USER, _CAT, body)

    service._repo.update_category_with_budget = MagicMock(side_effect=_PgError("23505"))
    with pytest.raises(ConflictError):
        service.update_custom_category(_USER, _CAT, body)


def test_repository_rpc_payload_passes_user_id_and_budget_flags() -> None:
    db = MagicMock()
    db.rpc.return_value.execute.return_value = MagicMock(
        data={"category": dict(_ROW), "monthly_amount": 5}
    )
    out = CategoryRepository(db).update_category_with_budget(
        user_id=_USER,
        category_id=_CAT,
        name=None,
        icon_name=None,
        color=None,
        set_budget=True,
        budget_amount=Decimal("5.00"),
    )
    name, params = db.rpc.call_args.args
    assert name == "update_category_with_budget"
    assert params["p_user_id"] == _USER
    assert params["p_set_budget"] is True
    assert params["p_budget_amount"] == "5.00"
    assert out["monthly_amount"] == 5
