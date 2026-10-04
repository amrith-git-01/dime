from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal
from urllib.parse import unquote, urlparse

from supabase import Client

logger = logging.getLogger(__name__)


@dataclass(slots=True, frozen=True)
class UploadResult:
    """Outcome of a successful Supabase Storage upload (private bucket; no public URL)."""

    object_path: str

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
) -> None:
    client.storage.from_(bucket).upload(
        object_path,
        file_bytes,
        {"content-type": content_type, "upsert": "true"},
    )


def upsert_public_object(
    *,
    client: Client,
    bucket: str,
    object_path: str,
    file_bytes: bytes,
    content_type: str,
) -> str:
    """Upload or replace an object and return its public URL (public buckets only)."""
    _upload_sync(
        client=client,
        bucket=bucket,
        object_path=object_path,
        file_bytes=file_bytes,
        content_type=content_type,
    )
    return _public_url_from_storage_response(
        client.storage.from_(bucket).get_public_url(object_path)
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
) -> UploadResult:
    ext = _normalize_extension(extension, kind)
    now = datetime.now(UTC)
    day = now.strftime("%Y-%m-%d")
    ts = int(now.timestamp() * 1000)
    object_path = f"{kind}/{user_id}/{kind}/{day}/{ts}-{uuid.uuid4().hex[:8]}.{ext}"
    logger.info(
        "[upload] start kind=%s bucket=%s path=%s bytes=%d content_type=%s",
        kind,
        bucket,
        object_path,
        len(file_bytes),
        content_type,
    )
    await asyncio.to_thread(
        _upload_sync,
        client=client,
        bucket=bucket,
        object_path=object_path,
        file_bytes=file_bytes,
        content_type=content_type,
    )
    logger.info("[upload] done kind=%s path=%s", kind, object_path)
    return UploadResult(object_path=object_path)


def _download_sync(*, client: Client, bucket: str, object_path: str) -> bytes:
    return bytes(client.storage.from_(bucket).download(object_path))


async def download_bytes(*, client: Client, bucket: str, object_path: str) -> bytes:
    """Fetch a stored object (jobs keep only the path, never the media bytes)."""
    return await asyncio.to_thread(
        _download_sync, client=client, bucket=bucket, object_path=object_path
    )


def _remove_sync(*, client: Client, bucket: str, object_path: str) -> None:
    client.storage.from_(bucket).remove([object_path])


async def delete_object_quietly(*, client: Client, bucket: str, object_path: str) -> None:
    """Best-effort cleanup (e.g. an upload whose job was a replay); never raises."""
    try:
        await asyncio.to_thread(
            _remove_sync, client=client, bucket=bucket, object_path=object_path
        )
    except Exception:
        logger.warning("[upload] cleanup failed path=%s", object_path, exc_info=True)


_PUBLIC_URL_MARKERS = ("/object/public/", "/object/authenticated/", "/object/sign/")


def split_stored_media_ref(stored: str, *, default_bucket: str) -> tuple[str, str] | None:
    """Resolve a stored ``receipt_url`` / ``voice_url`` value to ``(bucket, object_path)``.

    New rows hold the bare object path (private bucket). Legacy rows hold a full Supabase
    public URL; the bucket and path are extracted from it. Anything else yields ``None``.
    """
    value = stored.strip()
    if not value:
        return None
    if not value.startswith(("http://", "https://")):
        return default_bucket, value.lstrip("/")
    path = urlparse(value).path
    for marker in _PUBLIC_URL_MARKERS:
        _, found, rest = path.partition(marker)
        if not found:
            continue
        bucket, _, object_path = rest.partition("/")
        if bucket and object_path:
            return unquote(bucket), unquote(object_path)
    return None


def _signed_url_from_response(raw: Any) -> str | None:
    if isinstance(raw, dict):
        url = raw.get("signedURL") or raw.get("signedUrl")
        return url if isinstance(url, str) and url else None
    return None


def sign_media_urls(
    client: Client,
    stored_values: list[str | None],
    *,
    default_bucket: str,
    expires_in: int,
) -> dict[str, str | None]:
    """Batch-sign stored media refs; returns ``{stored_value: signed_url_or_None}``.

    One ``create_signed_urls`` call per bucket. Failures are logged and map to ``None`` so a
    storage hiccup never breaks the surrounding API response.
    """
    by_bucket: dict[str, dict[str, list[str]]] = {}
    result: dict[str, str | None] = {}
    for stored in stored_values:
        if not stored or stored in result:
            continue
        ref = split_stored_media_ref(stored, default_bucket=default_bucket)
        result[stored] = None
        if ref is None:
            continue
        bucket, object_path = ref
        by_bucket.setdefault(bucket, {}).setdefault(object_path, []).append(stored)

    for bucket, paths in by_bucket.items():
        try:
            signed = client.storage.from_(bucket).create_signed_urls(list(paths), expires_in)
        except Exception:
            logger.warning("[storage] batch signing failed bucket=%s", bucket, exc_info=True)
            continue
        for item in signed:
            url = _signed_url_from_response(item)
            object_path = item.get("path") if isinstance(item, dict) else None
            if url is None or not isinstance(object_path, str):
                continue
            for stored in paths.get(object_path, []):
                result[stored] = url
    return result
