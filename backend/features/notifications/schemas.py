"""Pydantic models for the notification inbox API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

NotificationKind = Literal["transaction_auto", "budget_threshold", "capture_failed"]
NotificationActionType = Literal[
    "transaction_detail",
    "home",
    "manual_add",
    "none",
]
NotificationFilter = Literal["all", "unread", "read"]


class NotificationAction(BaseModel):
    type: NotificationActionType
    transaction_id: UUID | None = None


class NotificationResponse(BaseModel):
    id: UUID
    kind: NotificationKind
    title: str
    body: str
    created_at: datetime
    read_at: datetime | None
    action: NotificationAction


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]


class UnreadCountResponse(BaseModel):
    count: int = Field(ge=0)
