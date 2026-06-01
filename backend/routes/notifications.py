"""Authenticated notification inbox routes."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

from core.async_utils import run_sync
from deps import get_current_user_id, get_supabase_service_client
from features.notifications.schemas import (
    NotificationFilter,
    NotificationListResponse,
    NotificationResponse,
    UnreadCountResponse,
)
from features.notifications.service import NotificationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    filter: NotificationFilter = Query("all"),
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> NotificationListResponse:
    try:
        service = NotificationService(supabase)
        return await run_sync(service.list_inbox, user_id, filter=filter)
    except Exception as exc:
        logger.exception("Failed to list notifications for user_id=%s", user_id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not load notifications.",
        ) from exc


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> UnreadCountResponse:
    try:
        service = NotificationService(supabase)
        return await run_sync(service.unread_count, user_id)
    except Exception as exc:
        logger.exception("Failed unread count for user_id=%s", user_id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not load unread count.",
        ) from exc


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: UUID,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> NotificationResponse:
    try:
        service = NotificationService(supabase)
        row = await run_sync(service.mark_read, user_id, str(notification_id))
    except Exception as exc:
        logger.exception(
            "Failed to mark notification read user_id=%s id=%s",
            user_id,
            notification_id,
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not mark notification read.",
        ) from exc
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Notification not found.")
    return row


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: UUID,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> None:
    try:
        service = NotificationService(supabase)
        deleted = await run_sync(service.delete, user_id, str(notification_id))
    except Exception as exc:
        logger.exception(
            "Failed to delete notification user_id=%s id=%s",
            user_id,
            notification_id,
        )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not delete notification.",
        ) from exc
    if not deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Notification not found.")
