"""Authenticated notification inbox routes."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from supabase import Client

from core.async_utils import run_sync
from core.errors import NotFoundError
from deps import get_current_user_id, get_supabase_service_client
from features.notifications.schemas import (
    NotificationFilter,
    NotificationListResponse,
    NotificationResponse,
    UnreadCountResponse,
)
from features.notifications.service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    filter: NotificationFilter = Query("all"),
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> NotificationListResponse:
    return await run_sync(NotificationService(supabase).list_inbox, user_id, filter=filter)


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> UnreadCountResponse:
    return await run_sync(NotificationService(supabase).unread_count, user_id)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: UUID,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> NotificationResponse:
    row = await run_sync(NotificationService(supabase).mark_read, user_id, str(notification_id))
    if row is None:
        raise NotFoundError("Notification not found.")
    return row


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: UUID,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> None:
    deleted = await run_sync(NotificationService(supabase).delete, user_id, str(notification_id))
    if not deleted:
        raise NotFoundError("Notification not found.")
