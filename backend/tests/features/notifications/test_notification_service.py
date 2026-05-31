from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from features.notifications.service import NotificationService

_USER = "11111111-1111-1111-1111-111111111111"
_NID = "22222222-2222-2222-2222-222222222222"
_ROW = {
    "id": _NID,
    "user_id": _USER,
    "kind": "budget_threshold",
    "title": "80% of budget used",
    "body": "You have spent ₹20,000 of ₹25,000.",
    "action_type": "home",
    "action_transaction_id": None,
    "created_at": "2026-05-31T10:00:00+00:00",
    "read_at": None,
    "deleted_at": None,
    "dedupe_key": "budget:monthly:80:2026-05",
}


@pytest.fixture
def service() -> NotificationService:
    return NotificationService(supabase=MagicMock())


def test_list_maps_action(service: NotificationService) -> None:
    service._repo.list_for_user = MagicMock(return_value=[dict(_ROW)])
    out = service.list_inbox(_USER, filter="all")
    assert len(out.items) == 1
    assert out.items[0].action.type == "home"
    assert out.items[0].read_at is None


def test_mark_read_returns_none_when_missing(service: NotificationService) -> None:
    service._repo.mark_read = MagicMock(return_value=None)
    assert service.mark_read(_USER, _NID) is None


def test_soft_delete(service: NotificationService) -> None:
    service._repo.soft_delete = MagicMock(return_value=True)
    assert service.delete(_USER, _NID) is True
