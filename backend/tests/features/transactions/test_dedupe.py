from datetime import UTC, datetime
from decimal import Decimal

from features.transactions.dedupe import (
    build_payment_hash,
    build_sparse_merge_patch,
    format_amount_for_hash,
    normalize_counterparty,
    transaction_minute_bucket,
)


def test_format_amount_for_hash_two_decimals() -> None:
    assert format_amount_for_hash("199") == "199.00"
    assert format_amount_for_hash(Decimal("199.5")) == "199.50"


def test_normalize_counterparty_strips_punctuation() -> None:
    assert normalize_counterparty("SWIGGY-INDIA") == "swiggy india"


def test_transaction_minute_bucket_utc() -> None:
    at = datetime(2026, 6, 18, 14, 30, 45, tzinfo=UTC)
    assert transaction_minute_bucket(at) == "2026-06-18T14:30"


def test_build_payment_hash_stable() -> None:
    at = datetime(2026, 6, 18, 14, 30, tzinfo=UTC)
    first = build_payment_hash(
        amount=Decimal("480.00"),
        tx_type="debit",
        counterparty_normalized="swiggy",
        counterparty_name="Swiggy",
        transaction_at=at,
    )
    second = build_payment_hash(
        amount="480",
        tx_type="debit",
        counterparty_normalized="swiggy",
        counterparty_name="SWIGGY",
        transaction_at=datetime(2026, 6, 18, 14, 30, 59, tzinfo=UTC),
    )
    assert first == second
    assert len(first) == 64


def test_build_payment_hash_differs_by_minute() -> None:
    base = {
        "amount": Decimal("100.00"),
        "tx_type": "debit",
        "counterparty_normalized": "cafe",
        "counterparty_name": "Cafe",
    }
    a = build_payment_hash(
        **base,
        transaction_at=datetime(2026, 6, 18, 14, 30, tzinfo=UTC),
    )
    b = build_payment_hash(
        **base,
        transaction_at=datetime(2026, 6, 18, 14, 31, tzinfo=UTC),
    )
    assert a != b


def test_build_sparse_merge_patch_fills_only_missing() -> None:
    existing = {
        "category_id": "cat-1",
        "note": None,
        "receipt_url": None,
    }
    incoming = {
        "category_id": "cat-2",
        "note": "lunch",
        "receipt_url": "https://example.com/r.jpg",
    }
    patch = build_sparse_merge_patch(existing, incoming)
    assert patch == {
        "note": "lunch",
        "receipt_url": "https://example.com/r.jpg",
    }


def test_build_sparse_merge_patch_empty_when_nothing_new() -> None:
    row = {"category_id": "a", "note": "b"}
    assert build_sparse_merge_patch(row, row) == {}
