"""Create notification rows on product events (deduped inserts)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal

from features.notifications.repository import NotificationRepository

AUTO_DETECTED = frozenset({"sms", "notification", "scan", "voice"})

# T2: emit from future POST /transactions/sms worker when SMS ingest ships.


def format_inr(amount: Decimal) -> str:
    quantized = amount.quantize(Decimal("0.01"))
    as_float = float(quantized)
    formatted = f"{as_float:,.2f}"
    if formatted.endswith(".00"):
        formatted = formatted[:-3]
    return f"₹{formatted}"


def title_for_auto_tx(row: dict[str, Any]) -> str:
    amount = Decimal(str(row.get("amount", "0")))
    return f"{format_inr(amount)} added"


def body_for_auto_tx(row: dict[str, Any]) -> str:
    merchant = row.get("merchant") or row.get("counterparty_name") or "Transaction"
    if not isinstance(merchant, str):
        merchant = "Transaction"
    merchant = merchant.strip() or "Transaction"
    category = row.get("category")
    if isinstance(category, str) and category.strip():
        return f"{merchant} · {category.strip()}"
    return merchant


class NotificationEmitter:
    def __init__(self, repo: NotificationRepository) -> None:
        self._repo = repo

    def emit_transaction_auto(
        self,
        *,
        user_id: str,
        transaction_id: str,
        title: str,
        body: str,
    ) -> None:
        self._repo.insert_deduped(
            {
                "user_id": user_id,
                "kind": "transaction_auto",
                "title": title,
                "body": body,
                "action_type": "transaction_detail",
                "action_transaction_id": transaction_id,
                "dedupe_key": f"transaction_auto:{transaction_id}",
            }
        )

    def emit_capture_failed(
        self,
        *,
        user_id: str,
        source: Literal["sms", "scan"],
        title: str,
        body: str,
        day_key: str,
    ) -> None:
        self._repo.insert_deduped(
            {
                "user_id": user_id,
                "kind": "capture_failed",
                "title": title,
                "body": body,
                "action_type": "manual_add",
                "action_transaction_id": None,
                "dedupe_key": f"capture_failed:{source}:{day_key}",
            }
        )

    def emit_budget_threshold(
        self,
        *,
        user_id: str,
        scope: Literal["monthly", "daily"],
        period_key: str,
        threshold: Literal[80, 100],
        title: str,
        body: str,
    ) -> None:
        self._repo.insert_deduped(
            {
                "user_id": user_id,
                "kind": "budget_threshold",
                "title": title,
                "body": body,
                "action_type": "home",
                "action_transaction_id": None,
                "dedupe_key": f"budget:{scope}:{threshold}:{period_key}",
            }
        )
