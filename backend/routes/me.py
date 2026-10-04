"""Current-user profile (compat: ``/me``, ``/me/profile``)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from supabase import Client

from core.async_utils import run_sync
from core.background import spawn
from core.config import get_settings
from core.security import CurrentUser
from deps import get_current_user, get_supabase_service_client
from features.email.service import EmailService
from features.user_profile.schemas import MeResponse, ProfileUpdateBody
from features.user_profile.service import UserProfileService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["me"])


async def _send_welcome(user: CurrentUser, username: str | None, supabase: Client) -> None:
    try:
        await run_sync(
            EmailService(supabase, get_settings()).send_welcome,
            user_id=user.id,
            email=user.email or "",
            username=username,
        )
    except Exception:
        logger.exception("welcome email task failed user=%s", user.id)


@router.get("/me", response_model=MeResponse)
async def read_me(
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
) -> MeResponse:
    me, should_welcome = await run_sync(UserProfileService(supabase).get_me_with_welcome_flag, user)
    if should_welcome and user.email:
        # Once-only is enforced by the email_sends unique key; the task is kept referenced.
        spawn(_send_welcome(user, me.username, supabase), name=f"welcome-{user.id}")
    return me


@router.put("/me/profile", response_model=MeResponse)
async def update_me_profile(
    body: ProfileUpdateBody,
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
) -> MeResponse:
    return await run_sync(UserProfileService(supabase).update_profile, user, body)
