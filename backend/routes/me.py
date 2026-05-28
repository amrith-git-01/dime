"""Current-user profile (compat: ``/me``, ``/me/profile``)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.async_utils import run_sync
from core.security import CurrentUser
from deps import get_current_user, get_supabase_service_client
from features.user_profile.schemas import MeResponse, ProfileUpdateBody
from features.user_profile.service import UserProfileService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["me"])


@router.get("/me", response_model=MeResponse)
async def read_me(
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
) -> MeResponse:
    try:
        service = UserProfileService(supabase)
        return await run_sync(service.get_me, user)
    except Exception as exc:
        logger.exception("Failed to read users row for id=%s", user.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not load profile.",
        ) from exc


@router.put("/me/profile", response_model=MeResponse)
async def update_me_profile(
    body: ProfileUpdateBody,
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
) -> MeResponse:
    try:
        service = UserProfileService(supabase)
        return await run_sync(service.update_profile, user, body)
    except Exception as exc:
        logger.exception("Failed to upsert users row for id=%s", user.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not save profile.",
        ) from exc
