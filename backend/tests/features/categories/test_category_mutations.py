from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from features.categories.schemas import UpdateCategoryRequest
from features.categories.service import CategoryService

_USER = "user-1"
_CAT = "cat-1"


@pytest.fixture
def service() -> CategoryService:
    return CategoryService(supabase=MagicMock())


def test_patch_system_category_forbidden(service: CategoryService) -> None:
    service._repo.fetch_by_id_for_user = MagicMock(
        return_value={"id": _CAT, "is_system": True},
    )
    with pytest.raises(HTTPException) as exc:
        service.update_custom_category(
            _USER,
            _CAT,
            UpdateCategoryRequest(name="Food"),
        )
    assert exc.value.status_code == 403


def test_delete_system_category_forbidden(service: CategoryService) -> None:
    service._repo.fetch_by_id_for_user = MagicMock(
        return_value={"id": _CAT, "is_system": True},
    )
    with pytest.raises(HTTPException) as exc:
        service.delete_custom_category(_USER, _CAT)
    assert exc.value.status_code == 403


def test_patch_custom_category_success(service: CategoryService) -> None:
    service._repo.fetch_by_id_for_user = MagicMock(
        return_value={"id": _CAT, "is_system": False},
    )
    service._repo.list_for_user = MagicMock(return_value=[])
    service._repo.update_custom_category = MagicMock(
        return_value={
            "id": _CAT,
            "name": "Snacks",
            "icon_name": "Tag",
            "color": "#94A3B8",
            "is_system": False,
            "created_at": "2026-01-01T00:00:00Z",
            "user_id": _USER,
        },
    )
    result = service.update_custom_category(
        _USER,
        _CAT,
        UpdateCategoryRequest(name="Snacks", color="#94A3B8"),
    )
    assert result.name == "Snacks"
    assert result.is_system is False


def test_delete_custom_category_success(service: CategoryService) -> None:
    service._repo.fetch_by_id_for_user = MagicMock(
        return_value={"id": _CAT, "is_system": False},
    )
    service._repo.count_transactions_for_category = MagicMock(return_value=0)
    service._repo.delete_custom_category = MagicMock(return_value=True)
    service.delete_custom_category(_USER, _CAT)
    service._repo.delete_custom_category.assert_called_once_with(
        user_id=_USER,
        category_id=_CAT,
    )


def test_delete_custom_category_requires_reassign_when_txns_exist(
    service: CategoryService,
) -> None:
    service._repo.fetch_by_id_for_user = MagicMock(
        return_value={"id": _CAT, "is_system": False, "name": "Old"},
    )
    service._repo.count_transactions_for_category = MagicMock(return_value=3)
    with pytest.raises(HTTPException) as exc:
        service.delete_custom_category(_USER, _CAT)
    assert exc.value.status_code == 422


def test_delete_custom_category_reassigns_then_deletes(service: CategoryService) -> None:
    target = "cat-2"
    service._repo.fetch_by_id_for_user = MagicMock(
        side_effect=[
            {"id": _CAT, "is_system": False, "name": "Old"},
            {"id": target, "is_system": True, "name": "Food"},
        ],
    )
    service._repo.count_transactions_for_category = MagicMock(return_value=2)
    service._repo.reassign_transactions_category = MagicMock()
    service._repo.delete_custom_category = MagicMock(return_value=True)
    service.delete_custom_category(
        _USER,
        _CAT,
        reassign_to_category_id=target,
    )
    service._repo.reassign_transactions_category.assert_called_once_with(
        user_id=_USER,
        from_category_id=_CAT,
        to_category_id=target,
    )
