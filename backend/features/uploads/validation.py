"""Upload guards: capped reads (413) and magic-byte content-type allowlists (415)."""

from __future__ import annotations

from fastapi import HTTPException, UploadFile, status

from utils.audio_format import detect_audio_format
from utils.image_format import detect_receipt_image_format

_READ_CHUNK_BYTES = 64 * 1024
_SNIFF_BYTES = 32


def _too_large(max_bytes: int) -> HTTPException:
    return HTTPException(
        413,
        detail=f"File too large (max {max_bytes // (1024 * 1024)} MB).",
    )


async def read_upload_capped(file: UploadFile, *, max_bytes: int) -> bytes:
    """Read an upload in chunks, raising 413 as soon as ``max_bytes`` is exceeded."""
    declared = file.size
    if declared is not None and declared > max_bytes:
        raise _too_large(max_bytes)
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(_READ_CHUNK_BYTES):
        total += len(chunk)
        if total > max_bytes:
            raise _too_large(max_bytes)
        chunks.append(chunk)
    return b"".join(chunks)


def sniff_receipt_content_type(data: bytes) -> str:
    """Return the real image content type, or raise 415 (jpeg/png/webp/heic/heif only)."""
    detected = detect_receipt_image_format(data[:_SNIFF_BYTES])
    if detected is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported image type (use JPEG, PNG, WebP, or HEIC).",
        )
    return detected[1]


def sniff_voice_content_type(data: bytes) -> str:
    """Return the real audio content type, or raise 415."""
    detected = detect_audio_format(data[:_SNIFF_BYTES])
    if detected is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported audio type.",
        )
    return detected[1]
