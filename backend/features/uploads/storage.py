from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

from supabase import Client

logger = logging.getLogger(__name__)


@dataclass(slots=True, frozen=True)
class UploadResult:
    """Outcome of a successful Supabase Storage upload."""

    object_path: str
    public_url: str

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


def _public_url_from_storage_response(raw: Any) -> str:
    if isinstance(raw, str):
        return raw
    if isinstance(raw, dict):
        url = raw.get("publicUrl") or raw.get("public_url")
        if isinstance(url, str):
            return url
    raise RuntimeError("Unexpected storage public URL response shape")


def _upload_sync(
    *,
    client: Client,
    bucket: str,
    object_path: str,
    file_bytes: bytes,
    content_type: str,
) -> str:
    bucket_client = client.storage.from_(bucket)
    bucket_client.upload(
        object_path,
        file_bytes,
        {"content-type": content_type, "upsert": "true"},
    )
    return _public_url_from_storage_response(bucket_client.get_public_url(object_path))


async def upload_bytes(
    *,
    client: Client,
    bucket: str,
    user_id: str,
    kind: UploadKind,
    file_bytes: bytes,
    content_type: str,
    extension: str | None = None,
) -> UploadResult:
    ext = _normalize_extension(extension, kind)
    now = datetime.now(UTC)
    day = now.strftime("%Y-%m-%d")
    ts = int(now.timestamp() * 1000)
    object_path = f"{kind}/{user_id}/{kind}/{day}/{ts}.{ext}"
    logger.info(
        "[upload] start kind=%s bucket=%s path=%s bytes=%d content_type=%s",
        kind,
        bucket,
        object_path,
        len(file_bytes),
        content_type,
    )
    public_url = await asyncio.to_thread(
        _upload_sync,
        client=client,
        bucket=bucket,
        object_path=object_path,
        file_bytes=file_bytes,
        content_type=content_type,
    )
    logger.info(
        "[upload] done kind=%s path=%s public_url=%s",
        kind,
        object_path,
        public_url,
    )
    return UploadResult(object_path=object_path, public_url=public_url)
