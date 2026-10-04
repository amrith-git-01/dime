from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import MagicMock

from core.security import CurrentUser
from features.transactions.schemas import InternalTransactionCreate, TransactionCreate
from features.transactions.service import TransactionService

_PAYLOAD = {
    "amount": "10.00",
    "type": "debit",
    "counterparty_name": "Shop",
    "transaction_at": "2026-10-04T10:00:00+00:00",
}
_FORGED = {
    "detected_via": "sms",
    "receipt_url": "https://evil.example.com/r.jpg",
    "voice_url": "https://evil.example.com/v.wav",
}


def test_public_create_ignores_client_supplied_server_fields() -> None:
    body = TransactionCreate.model_validate({**_PAYLOAD, **_FORGED})
    assert "detected_via" not in body.model_dump()
    assert not hasattr(body, "receipt_url")
    assert not hasattr(body, "voice_url")
    fields = TransactionCreate.model_fields
    assert not {"detected_via", "receipt_url", "voice_url"} & set(fields)


def test_internal_create_still_carries_server_fields() -> None:
    body = InternalTransactionCreate(
        amount=Decimal("10"),
        type="debit",
        counterparty_name="Shop",
        transaction_at=datetime(2026, 10, 4, tzinfo=UTC),
        detected_via="scan",
        receipt_url="receipts/u1/receipts/d/1.jpg",
    )
    assert body.detected_via == "scan"
    assert body.receipt_url == "receipts/u1/receipts/d/1.jpg"


def test_manual_create_stores_manual_and_no_media_for_forged_body() -> None:
    service = TransactionService(supabase=MagicMock())
    service._repo.find_by_payment_hash = MagicMock(return_value=None)
    service._category_exists = MagicMock(return_value=False)  # type: ignore[method-assign]
    service._resolve_category = MagicMock(return_value=(None, None))  # type: ignore[method-assign]
    service._response_from_new = MagicMock()  # type: ignore[method-assign]
    inserted: dict[str, object] = {}
    service._repo.insert = MagicMock(side_effect=lambda row: inserted.update(row) or row)

    service.create_manual(
        CurrentUser(id="user-1"),
        TransactionCreate.model_validate({**_PAYLOAD, **_FORGED}),
        timezone="Asia/Kolkata",
    )

    assert inserted["detected_via"] == "manual"
    assert inserted["receipt_url"] is None
    assert inserted["voice_url"] is None
