from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.async_utils import run_sync
from deps import get_current_user_id, get_supabase_service_client
from features.notifications.push_tokens_repository import PushTokensRepository
from features.notifications.push_tokens_schemas import (
    PushTokenBody,
    PushTokenDeleteBody,
    PushTokenResponse,
)
from features.notifications.push_tokens_service import PushTokensService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["push-tokens"])


@router.put("/me/push-token", response_model=PushTokenResponse)
async def register_push_token(
    body: PushTokenBody,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> PushTokenResponse:
    try:
        service = PushTokensService(PushTokensRepository(supabase))
        return await run_sync(service.register, user_id, body.token, body.platform)
    except Exception as exc:
        logger.exception("Failed to register push token for user_id=%s", user_id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not register push token.",
        ) from exc


@router.delete("/me/push-token", status_code=status.HTTP_204_NO_CONTENT)
async def delete_push_token(
    body: PushTokenDeleteBody,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> None:
    try:
        service = PushTokensService(PushTokensRepository(supabase))
        await run_sync(service.unregister, user_id, body.token)
    except Exception as exc:
        logger.exception("Failed to delete push token for user_id=%s", user_id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not delete push token.",
        ) from exc

