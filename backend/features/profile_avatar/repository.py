"""Supabase Storage + ``users.avatar_url`` persistence."""

from __future__ import annotations

import logging
import time
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)


def _public_url_from_storage_response(raw: Any) -> str:
    if isinstance(raw, str):
        return raw
    if isinstance(raw, dict) and "publicUrl" in raw:
        url = raw["publicUrl"]
        if isinstance(url, str):
            return url
    raise RuntimeError("Unexpected storage public URL response shape")


class ProfileAvatarRepository:
    def __init__(self, supabase: Client) -> None:
        self._client = supabase

    def upload_object_and_set_avatar_url(
        self,
        *,
        user_id: str,
        bucket: str,
        object_path: str,
        file_bytes: bytes,
        content_type: str,
    ) -> str:
        bucket_client = self._client.storage.from_(bucket)
        try:
            bucket_client.upload(
                object_path,
                file_bytes,
                {"content-type": content_type, "upsert": "true"},
            )
            public_raw = bucket_client.get_public_url(object_path)
            public_url = _public_url_from_storage_response(public_raw)
        except Exception as exc:
            logger.exception("Supabase storage upload failed for user_id=%s", user_id)
            raise RuntimeError("Could not store image.") from exc

        version = int(time.time() * 1000)
        if "?" in public_url:
            avatar_url = f"{public_url}&v={version}"
        else:
            avatar_url = f"{public_url}?v={version}"

        try:
            self._client.table("users").update({"avatar_url": avatar_url}).eq("id", user_id).execute()
        except Exception as exc:
            logger.exception("Failed to update users.avatar_url for user_id=%s", user_id)
            raise RuntimeError("Image stored but profile could not be updated.") from exc

        return avatar_url
