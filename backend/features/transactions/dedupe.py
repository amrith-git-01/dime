"""Transaction deduplication: payment_hash fingerprint + sparse merge."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

MERGEABLE_FIELDS = (
    "category_id",
    "note",
    "receipt_url",
    "voice_url",
    "counterparty_type",
)


def normalize_counterparty(raw: str) -> str:
    lowered = raw.strip().lower()
    lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
    normalized = re.sub(r"\s+", " ", lowered).strip()
    return normalized


def format_amount_for_hash(amount: str | Decimal) -> str:
    value = amount if isinstance(amount, Decimal) else Decimal(str(amount))
    return f"{value.quantize(Decimal('0.01')):.2f}"


def transaction_minute_bucket(transaction_at: datetime) -> str:
    """UTC minute bucket for stable cross-source matching."""
    if transaction_at.tzinfo is None:
        aware = transaction_at.replace(tzinfo=UTC)
    else:
        aware = transaction_at.astimezone(UTC)
    return aware.strftime("%Y-%m-%dT%H:%M")


def build_payment_hash(
    *,
    amount: str | Decimal,
    tx_type: str,
    counterparty_normalized: str | None,
    counterparty_name: str,
    transaction_at: datetime,
) -> str:
    counterparty = (counterparty_normalized or "").strip()
    if not counterparty:
        counterparty = normalize_counterparty(counterparty_name)
    canonical = {
        "amount": format_amount_for_hash(amount),
        "type": tx_type,
        "counterparty": counterparty,
        "minute": transaction_minute_bucket(transaction_at),
    }
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build_sparse_merge_patch(
    existing: dict[str, Any],
    incoming: dict[str, Any],
) -> dict[str, Any]:
    """Fill missing fields on an existing row from a re-ingested capture."""
    patch: dict[str, Any] = {}
    for field in MERGEABLE_FIELDS:
        if existing.get(field):
            continue
        value = incoming.get(field)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        patch[field] = value
    return patch
