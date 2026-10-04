"""Create notification rows on product events (deduped inserts)."""

from __future__ import annotations

import logging
from collections.abc import Callable
from decimal import Decimal
from typing import Any, Literal

from features.notifications.push import send_expo_push
from features.notifications.push_tokens_repository import PushTokensRepository
from features.notifications.repository import NotificationRepository
from features.user_settings.snapshot import UserSettingsSnapshot

logger = logging.getLogger(__name__)

AUTO_DETECTED = frozenset({"sms", "notification", "scan", "voice"})


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
    def __init__(
        self,
        repo: NotificationRepository,
        settings: UserSettingsSnapshot | None = None,
        push_tokens_repo: PushTokensRepository | None = None,
        push_send: Callable[..., None] | None = None,
    ) -> None:
        self._repo = repo
        self._settings = settings or UserSettingsSnapshot()
        if push_tokens_repo is None:
            db = getattr(repo, "_db", None)
            if db is not None:
                push_tokens_repo = PushTokensRepository(db)
        self._push_tokens_repo = push_tokens_repo
        self._push_send = push_send or send_expo_push

    def emit_transaction_auto(
        self,
        *,
        user_id: str,
        transaction_id: str,
        title: str,
        body: str,
    ) -> None:
        if not self._settings.auto_capture_alerts_enabled:
            return
        row = self._repo.insert_deduped(
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
        if row is None:
            return
        self._maybe_push(user_id=user_id, row=row)

    def emit_capture_failed(
        self,
        *,
        user_id: str,
        source: Literal["sms", "scan"],
        title: str,
        body: str,
        day_key: str,
    ) -> None:
        if not self._settings.capture_failed_alerts_enabled:
            return
        row = self._repo.insert_deduped(
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
        if row is None:
            return
        self._maybe_push(user_id=user_id, row=row)

    def emit_budget_threshold(
        self,
        *,
        user_id: str,
        scope: Literal["monthly", "daily"],
        period_key: str,
        threshold: int,
        title: str,
        body: str,
    ) -> None:
        row = self._repo.insert_deduped(
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
        if row is None:
            return
        self._maybe_push(user_id=user_id, row=row)

    def emit_category_budget_threshold(
        self,
        *,
        user_id: str,
        category_id: str,
        period_key: str,
        threshold: int,
        title: str,
        body: str,
    ) -> None:
        row = self._repo.insert_deduped(
            {
                "user_id": user_id,
                "kind": "budget_threshold",
                "title": title,
                "body": body,
                "action_type": "home",
                "action_transaction_id": None,
                "dedupe_key": f"budget:category:{category_id}:{threshold}:{period_key}",
            }
        )
        if row is None:
            return
        self._maybe_push(user_id=user_id, row=row)

    def _maybe_push(self, *, user_id: str, row: dict[str, Any]) -> None:
        if not self._settings.device_notifications_enabled:
            return
        if self._push_tokens_repo is None or self._push_send is None:
            return
        try:
            tokens = self._push_tokens_repo.list_tokens(user_id)
            if not tokens:
                return
            data = {
                "notification_id": str(row.get("id", "")),
                "kind": row.get("kind"),
                "action_type": row.get("action_type"),
                "action_transaction_id": row.get("action_transaction_id"),
            }
            self._push_send(
                tokens=tokens,
                title=str(row.get("title") or ""),
                body=str(row.get("body") or ""),
                data=data,
                on_invalid_token=self._push_tokens_repo.delete_by_token,
            )
        except Exception:
            logger.exception(
                "push after notification insert failed user_id=%s",
                user_id,
            )
