from __future__ import annotations

from fastapi import APIRouter, Depends
from supabase import Client

from core.async_utils import run_sync
from deps import get_current_user_id, get_supabase_service_client
from features.user_settings.repository import UserSettingsRepository
from features.user_settings.schemas import UserSettingsPatchBody, UserSettingsResponse
from features.user_settings.service import UserSettingsService

router = APIRouter(tags=["settings"])


@router.get("/me/settings", response_model=UserSettingsResponse)
async def read_user_settings(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> UserSettingsResponse:
    service = UserSettingsService(UserSettingsRepository(supabase))
    return await run_sync(service.get_or_create, user_id)


@router.patch("/me/settings", response_model=UserSettingsResponse)
async def patch_user_settings(
    body: UserSettingsPatchBody,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> UserSettingsResponse:
    service = UserSettingsService(UserSettingsRepository(supabase))
    return await run_sync(service.patch, user_id, body)
