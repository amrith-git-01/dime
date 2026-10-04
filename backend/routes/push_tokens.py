from __future__ import annotations

from fastapi import APIRouter, Depends, status
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

router = APIRouter(tags=["push-tokens"])


@router.put("/me/push-token", response_model=PushTokenResponse)
async def register_push_token(
    body: PushTokenBody,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> PushTokenResponse:
    service = PushTokensService(PushTokensRepository(supabase))
    return await run_sync(service.register, user_id, body.token, body.platform)


@router.delete("/me/push-token", status_code=status.HTTP_204_NO_CONTENT)
async def delete_push_token(
    body: PushTokenDeleteBody,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> None:
    service = PushTokensService(PushTokensRepository(supabase))
    await run_sync(service.unregister, user_id, body.token)
