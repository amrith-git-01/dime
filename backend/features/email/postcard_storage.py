"""Welcome postcards in Supabase Storage so Gmail can fetch HTTPS images."""

from __future__ import annotations

import logging
from pathlib import Path

from supabase import Client

from core.config import Settings
from features.uploads.storage import upsert_public_object

logger = logging.getLogger(__name__)

POSTCARD_PREFIX = "email"
POSTCARD_FILES = (
    "slide-1.png",
    "slide-2.png",
    "slide-3.png",
    "slide-4.png",
    "slide-5.png",
)


def local_postcard_dir() -> Path:
    return Path(__file__).resolve().parent / "assets"


def public_postcard_base(
    *,
    supabase_url: str,
    bucket: str,
    override: str | None = None,
) -> str:
    cleaned = (override or "").strip()
    if cleaned:
        return cleaned.rstrip("/")
    root = supabase_url.rstrip("/")
    return f"{root}/storage/v1/object/public/{bucket}/{POSTCARD_PREFIX}"


def postcard_asset_base(settings: Settings) -> str:
    return public_postcard_base(
        supabase_url=settings.supabase_url,
        bucket=settings.storage_bucket,
        override=settings.email_asset_base_url,
    )


def _folder_from_object_url(public_url: str, filename: str) -> str | None:
    path = public_url.split("?", 1)[0].rstrip("/")
    suffix = f"/{filename}"
    if not path.endswith(suffix):
        return None
    return path[: -len(filename)].rstrip("/")


def sync_welcome_postcards(*, client: Client, settings: Settings) -> str:
    """Upsert local PNGs to Storage. Returns the public folder URL for <img src>."""
    base = postcard_asset_base(settings)
    assets = local_postcard_dir()
    for name in POSTCARD_FILES:
        path = assets / name
        if not path.is_file():
            logger.warning("Missing email postcard %s", path)
            continue
        try:
            public_url = upsert_public_object(
                client=client,
                bucket=settings.storage_bucket,
                object_path=f"{POSTCARD_PREFIX}/{name}",
                file_bytes=path.read_bytes(),
                content_type="image/png",
            )
        except Exception:
            logger.exception("Could not upload email postcard %s", name)
            continue
        folder = _folder_from_object_url(public_url, name)
        if folder:
            base = folder
            logger.info("Uploaded email postcard %s -> %s", name, public_url.split("?", 1)[0])
    return base
