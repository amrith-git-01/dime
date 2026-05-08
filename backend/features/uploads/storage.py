from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Literal

from supabase import Client

UploadKind = Literal["receipts", "voice_inputs"]

_DEFAULT_EXTENSION_BY_KIND: dict[UploadKind, str] = {
    "receipts": "jpg",
    "voice_inputs": "wav",
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
    now = datetime.now(UTC)
    day = now.strftime("%Y-%m-%d")
    ts = int(now.timestamp() * 1000)
    object_path = f"{kind}/{user_id}/{kind}/{day}/{ts}.{ext}"
    await asyncio.to_thread(
        _upload_sync,
        client=client,
        bucket=bucket,
        object_path=object_path,
        file_bytes=file_bytes,
        content_type=content_type,
    )
    return object_path
