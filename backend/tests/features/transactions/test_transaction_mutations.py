from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import UUID

import pytest
from fastapi import HTTPException

from core.security import CurrentUser
from features.transactions.schemas import TransactionUpdate
from features.transactions.service import TransactionService

_USER = CurrentUser(id="user-1", email="a@b.c")
_TX = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

_EXISTING = {
    "id": _TX,
    "user_id": "user-1",
    "amount": "100.00",
    "type": "debit",
    "counterparty_name": "Old Shop",
    "counterparty_type": "merchant",
    "counterparty_normalized": "old shop",
    "merchant": "Old Shop",
    "category": None,
    "category_id": "cat-1",
    "note": None,
    "detected_via": "sms",
    "receipt_url": "https://example/r.jpg",
    "voice_url": None,
    "payment_hash": "keep-me",
    "transaction_at": "2026-08-01T10:00:00+00:00",
    "created_at": "2026-08-01T10:00:00+00:00",
    "updated_at": "2026-08-01T10:00:00+00:00",
    "deleted_at": None,
}


@pytest.fixture
def service() -> TransactionService:
    return TransactionService(supabase=MagicMock())


def _update_body() -> TransactionUpdate:
    return TransactionUpdate(
        amount=Decimal("250.50"),
        type="credit",
        counterparty_name="New Payee",
        counterparty_type="person",
        category="Income",
        category_id=UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
        note="fixed",
        transaction_at=datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc),
    )


def test_update_manual_writes_editable_fields_only(service: TransactionService) -> None:
    service._repo.fetch_active_for_user = MagicMock(return_value=dict(_EXISTING))
    service._category_exists = MagicMock(return_value=True)  # type: ignore[method-assign]
    updated = {**_EXISTING, "amount": "250.50", "type": "credit"}
    service._repo.update_for_user = MagicMock(return_value=updated)
    service._enrich_rows = MagicMock(return_value=[updated])  # type: ignore[method-assign]

    result = service.update_manual(_USER, _TX, _update_body())

    patch = service._repo.update_for_user.call_args.kwargs["patch"]
    assert patch["amount"] == "250.50"
    assert patch["type"] == "credit"
    assert patch["counterparty_name"] == "New Payee"
    assert patch["counterparty_type"] == "person"
    assert patch["note"] == "fixed"
    assert "payment_hash" not in patch
    assert "detected_via" not in patch
    assert "receipt_url" not in patch
    assert "voice_url" not in patch
    assert result.amount == "250.50"


def test_update_manual_404_when_missing(service: TransactionService) -> None:
    service._repo.fetch_active_for_user = MagicMock(return_value=None)
    with pytest.raises(HTTPException) as exc:
        service.update_manual(_USER, _TX, _update_body())
    assert exc.value.status_code == 404
    assert exc.value.detail == "Transaction not found."


def test_soft_delete_404_when_missing(service: TransactionService) -> None:
    service._repo.soft_delete_for_user = MagicMock(return_value=False)
    with pytest.raises(HTTPException) as exc:
        service.soft_delete(_USER, _TX)
    assert exc.value.status_code == 404


def test_soft_delete_success(service: TransactionService) -> None:
    service._repo.soft_delete_for_user = MagicMock(return_value=True)
    service.soft_delete(_USER, _TX)
    service._repo.soft_delete_for_user.assert_called_once_with(
        user_id="user-1",
        transaction_id=_TX,
    )
