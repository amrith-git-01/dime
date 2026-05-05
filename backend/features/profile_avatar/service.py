"""Validate avatar bytes and delegate to storage repository."""

from __future__ import annotations

from supabase import Client

from features.profile_avatar.repository import ProfileAvatarRepository
from utils.image_format import detect_image_format

MAX_AVATAR_BYTES = 5 * 1024 * 1024


class ProfileAvatarService:
    def __init__(self, supabase: Client) -> None:
        self._repo = ProfileAvatarRepository(supabase)

    def upload_avatar(self, *, user_id: str, file_bytes: bytes, bucket: str) -> str:
        if not file_bytes:
            raise ValueError("Empty file.")
        if len(file_bytes) > MAX_AVATAR_BYTES:
            raise ValueError(f"Image too large (max {MAX_AVATAR_BYTES // (1024 * 1024)} MB).")

        detected = detect_image_format(file_bytes[:32])
        if not detected:
            raise ValueError("Unsupported image type (use JPEG, PNG, or WebP).")

        ext, content_type = detected
        object_path = f"avatars/{user_id}/avatar.{ext}"
        return self._repo.upload_object_and_set_avatar_url(
            user_id=user_id,
            bucket=bucket,
            object_path=object_path,
            file_bytes=file_bytes,
            content_type=content_type,
        )
