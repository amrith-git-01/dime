from __future__ import annotations

import asyncio
from typing import Literal
from uuid import uuid4

from supabase import Client

UploadKind = Literal["receipts", "voice"]

_DEFAULT_EXTENSION_BY_KIND: dict[UploadKind, str] = {
    "receipts": "jpg",
    "voice": "wav",
}


def _normalize_extension(ext: str | None, kind: UploadKind) -> str:
    cleaned = (ext or "").strip().lstrip(".").lower()
    if cleaned:
        return cleaned
    return _DEFAULT_EXTENSION_BY_KIND[kind]


def _upload_sync(
    *,
    client: Client,
    bucket: str,
    object_path: str,
    file_bytes: bytes,
    content_type: str,
) -> None:
    client.storage.from_(bucket).upload(
        object_path,
        file_bytes,
        {"content-type": content_type, "upsert": "true"},
    )


async def upload_bytes(
    *,
    client: Client,
    bucket: str,
    user_id: str,
    kind: UploadKind,
    file_bytes: bytes,
    content_type: str,
    extension: str | None = None,
) -> str:
    ext = _normalize_extension(extension, kind)
    object_path = f"{user_id}/{kind}/{uuid4().hex}.{ext}"
    await asyncio.to_thread(
        _upload_sync,
        client=client,
        bucket=bucket,
        object_path=object_path,
        file_bytes=file_bytes,
        content_type=content_type,
    )
    return object_path
