from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import UUID

import pytest
from fastapi import HTTPException

from core.errors import ConflictError, NotFoundError
from core.security import CurrentUser
from features.transactions.dedupe import build_payment_hash
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
        transaction_at=datetime(2026, 8, 2, 12, 0, tzinfo=UTC),
    )


def test_update_manual_writes_editable_fields_only(service: TransactionService) -> None:
    service._repo.fetch_active_for_user = MagicMock(return_value=dict(_EXISTING))
    service._category_exists = MagicMock(return_value=True)  # type: ignore[method-assign]
    updated = {**_EXISTING, "amount": "250.50", "type": "credit"}
    service._repo.update_for_user = MagicMock(return_value=updated)
    service._repo.find_by_payment_hash = MagicMock(return_value=None)
    service._enrich_rows = MagicMock(return_value=[updated])  # type: ignore[method-assign]

    result = service.update_manual(_USER, _TX, _update_body())

    service._repo.fetch_active_for_user.assert_called_once_with("user-1", _TX)

    update_kwargs = service._repo.update_for_user.call_args.kwargs
    assert update_kwargs["user_id"] == "user-1"
    assert update_kwargs["transaction_id"] == _TX
    patch = update_kwargs["patch"]
    assert patch["amount"] == "250.50"
    assert patch["type"] == "credit"
    assert patch["counterparty_name"] == "New Payee"
    assert patch["counterparty_type"] == "person"
    assert patch["note"] == "fixed"
    # B2: the fingerprint follows the edited amount / type / payee / time.
    assert patch["payment_hash"] == build_payment_hash(
        amount=Decimal("250.50"),
        tx_type="credit",
        counterparty_normalized="new payee",
        counterparty_name="New Payee",
        transaction_at=datetime(2026, 8, 2, 12, 0, tzinfo=UTC),
    )
    assert patch["payment_hash"] != "keep-me"
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
    service._repo.fetch_active_for_user.assert_called_once_with("user-1", _TX)


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


def _hash_for(existing: dict, body: TransactionUpdate) -> str:
    return build_payment_hash(
        amount=body.amount,
        tx_type=body.type,
        counterparty_normalized=" ".join(body.counterparty_name.lower().split()),
        counterparty_name=body.counterparty_name,
        transaction_at=body.transaction_at,
    )


def test_update_manual_does_not_rewrite_hash_when_fingerprint_unchanged(
    service: TransactionService,
) -> None:
    body = _update_body()
    same_hash = _hash_for(_EXISTING, body)
    existing = {**_EXISTING, "payment_hash": same_hash}
    service._repo.fetch_active_for_user = MagicMock(return_value=existing)
    service._category_exists = MagicMock(return_value=True)  # type: ignore[method-assign]
    service._repo.find_by_payment_hash = MagicMock()
    service._repo.update_for_user = MagicMock(return_value=existing)
    service._enrich_rows = MagicMock(return_value=[existing])  # type: ignore[method-assign]

    service.update_manual(_USER, _TX, body)

    assert "payment_hash" not in service._repo.update_for_user.call_args.kwargs["patch"]
    service._repo.find_by_payment_hash.assert_not_called()


def test_update_manual_conflicts_when_edit_matches_another_transaction(
    service: TransactionService,
) -> None:
    service._repo.fetch_active_for_user = MagicMock(return_value=dict(_EXISTING))
    service._category_exists = MagicMock(return_value=True)  # type: ignore[method-assign]
    service._repo.find_by_payment_hash = MagicMock(return_value={"id": "someone-else"})
    service._repo.update_for_user = MagicMock()

    with pytest.raises(ConflictError):
        service.update_manual(_USER, _TX, _update_body())
    service._repo.update_for_user.assert_not_called()


def test_get_one_returns_enriched_row_or_404(service: TransactionService) -> None:
    service._repo.fetch_active_for_user = MagicMock(return_value=dict(_EXISTING))
    service._enrich_rows = MagicMock(return_value=[dict(_EXISTING)])  # type: ignore[method-assign]
    assert service.get_one(_USER, _TX).id == _TX
    service._repo.fetch_active_for_user.assert_called_once_with("user-1", _TX)

    service._repo.fetch_active_for_user = MagicMock(return_value=None)
    with pytest.raises(NotFoundError):
        service.get_one(_USER, _TX)


def test_list_and_summary_ranges_are_half_open() -> None:
    from features.transactions.repository import TransactionRepository
    from features.transactions.time_bounds import month_range_iso

    start, end = month_range_iso(2026, 12, "Asia/Kolkata")
    assert start.startswith("2026-12-01T00:00:00")
    assert end.startswith("2027-01-01T00:00:00")

    db = MagicMock()
    query = db.table.return_value.select.return_value.eq.return_value.is_.return_value
    query.gte.return_value = query
    query.lt.return_value = query
    query.order.return_value = query
    query.range.return_value = query
    query.limit.return_value = query
    query.execute.return_value = MagicMock(data=[])
    TransactionRepository(db).list_for_user_paginated(
        "u1", from_iso=start, to_iso=end, limit=10, offset=0
    )
    query.gte.assert_called_with("transaction_at", start)
    query.lt.assert_called_with("transaction_at", end)
    query.lte.assert_not_called()
