"""Notification inbox CRUD for the authenticated user."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from supabase import Client

from features.notifications.repository import NotificationRepository
from features.notifications.schemas import (
    NotificationAction,
    NotificationListResponse,
    NotificationResponse,
    UnreadCountResponse,
)


def _row_to_response(row: dict[str, Any]) -> NotificationResponse:
    action_type = row.get("action_type")
    tx_raw = row.get("action_transaction_id")
    transaction_id: UUID | None = None
    if isinstance(tx_raw, str) and tx_raw.strip():
        transaction_id = UUID(tx_raw)
    elif tx_raw is not None:
        transaction_id = UUID(str(tx_raw))

    return NotificationResponse(
        id=UUID(str(row["id"])),
        kind=row["kind"],  # type: ignore[arg-type]
        title=str(row["title"]),
        body=str(row["body"]),
        created_at=row["created_at"],  # type: ignore[arg-type]
        read_at=row.get("read_at"),  # type: ignore[arg-type]
        action=NotificationAction(
            type=action_type,  # type: ignore[arg-type]
            transaction_id=transaction_id,
        ),
    )


class NotificationService:
    def __init__(self, supabase: Client) -> None:
        self._repo = NotificationRepository(supabase)

    def list_inbox(self, user_id: str, *, filter: str) -> NotificationListResponse:
        rows = self._repo.list_for_user(user_id, filter=filter)
        return NotificationListResponse(items=[_row_to_response(r) for r in rows])

    def mark_read(self, user_id: str, notification_id: str) -> NotificationResponse | None:
        row = self._repo.mark_read(user_id, notification_id)
        if row is None:
            return None
        return _row_to_response(row)

    def delete(self, user_id: str, notification_id: str) -> bool:
        return self._repo.soft_delete(user_id, notification_id)

    def unread_count(self, user_id: str) -> UnreadCountResponse:
        return UnreadCountResponse(count=self._repo.count_unread(user_id))
