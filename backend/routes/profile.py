"""Profile avatar upload (compat: ``POST /profile/avatar``)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from supabase import Client

from core.async_utils import run_sync
from core.config import get_settings
from deps import get_current_user_id, get_supabase_service_client
from features.profile_avatar.fetch import fetch_avatar_image
from features.profile_avatar.service import MAX_AVATAR_BYTES, ProfileAvatarService
from features.uploads.validation import read_upload_capped

router = APIRouter(prefix="/profile", tags=["profile"])


class ProfileAvatarUploadResponse(BaseModel):
    avatar_url: str


class ProfileAvatarFromUrlBody(BaseModel):
    image_url: str


@router.post("/avatar", response_model=ProfileAvatarUploadResponse)
async def upload_profile_avatar(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
    file: UploadFile = File(..., description="JPEG, PNG, or WebP image."),
) -> ProfileAvatarUploadResponse:
    settings = get_settings()
    data = await read_upload_capped(file, max_bytes=MAX_AVATAR_BYTES)
    try:
        service = ProfileAvatarService(supabase)
        url = await run_sync(
            service.upload_avatar,
            user_id=user_id,
            file_bytes=data,
            bucket=settings.storage_bucket,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return ProfileAvatarUploadResponse(avatar_url=url)


@router.post("/avatar/from-url", response_model=ProfileAvatarUploadResponse)
async def upload_profile_avatar_from_url(
    body: ProfileAvatarFromUrlBody,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> ProfileAvatarUploadResponse:
    settings = get_settings()
    try:
        data = await fetch_avatar_image(
            body.image_url,
            allowed_hosts=settings.avatar_url_allowed_hosts,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    try:
        service = ProfileAvatarService(supabase)
        url = await run_sync(
            service.upload_avatar,
            user_id=user_id,
            file_bytes=data,
            bucket=settings.storage_bucket,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return ProfileAvatarUploadResponse(avatar_url=url)
