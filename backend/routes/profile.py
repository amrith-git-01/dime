"""Profile avatar upload (compat: ``POST /profile/avatar``)."""

from __future__ import annotations

from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from supabase import Client

from core.config import get_settings
from deps import get_current_user_id, get_supabase_service_client
from features.profile_avatar.service import ProfileAvatarService

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


@router.post("/avatar/from-url", response_model=ProfileAvatarUploadResponse)
def upload_profile_avatar_from_url(
    body: ProfileAvatarFromUrlBody,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> ProfileAvatarUploadResponse:
    settings = get_settings()
    parsed = urlparse(body.image_url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid image URL.")

    request = Request(
        body.image_url.strip(),
        headers={"User-Agent": "DimeAvatarFetcher/1.0"},
    )
    try:
        with urlopen(request, timeout=12) as response:
            data = response.read()
    except URLError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Could not fetch selected avatar image.",
        ) from exc

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
