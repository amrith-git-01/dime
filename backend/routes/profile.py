"""Profile avatar upload (compat: ``POST /profile/avatar``)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from supabase import Client

from core.config import get_settings
from deps import get_current_user_id, get_supabase_service_client
from features.profile_avatar.service import ProfileAvatarService

router = APIRouter(prefix="/profile", tags=["profile"])


class ProfileAvatarUploadResponse(BaseModel):
    avatar_url: str


@router.post("/avatar", response_model=ProfileAvatarUploadResponse)
async def upload_profile_avatar(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
    file: UploadFile = File(..., description="JPEG, PNG, or WebP image."),
) -> ProfileAvatarUploadResponse:
    settings = get_settings()
    data = await file.read()
    try:
        url = ProfileAvatarService(supabase).upload_avatar(
            user_id=user_id,
            file_bytes=data,
            bucket=settings.storage_bucket,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return ProfileAvatarUploadResponse(avatar_url=url)
