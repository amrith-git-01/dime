"""Fetch a remote avatar image safely (SSRF-hardened) for ``POST /profile/avatar/from-url``."""

from __future__ import annotations

import logging
from collections.abc import Collection
from urllib.parse import urlparse

import httpx

from features.profile_avatar.service import MAX_AVATAR_BYTES

logger = logging.getLogger(__name__)

_FETCH_TIMEOUT_SECONDS = 10.0
_USER_AGENT = "DimeAvatarFetcher/1.0"


class AvatarFetchError(ValueError):
    """The URL is not allowed or the remote image could not be fetched safely."""


def validate_avatar_url(image_url: str, *, allowed_hosts: Collection[str]) -> str:
    """Return the normalized URL if it is https, host-allowlisted, and credential-free."""
    parsed = urlparse(image_url.strip())
    host = (parsed.hostname or "").lower()
    allowed = {h.strip().lower() for h in allowed_hosts if h.strip()}
    try:
        port = parsed.port
    except ValueError as exc:
        raise AvatarFetchError("Invalid image URL.") from exc
    if (
        parsed.scheme != "https"
        or not host
        or host not in allowed
        or parsed.username is not None
        or parsed.password is not None
        or port not in (None, 443)
    ):
        raise AvatarFetchError("Image URL is not allowed.")
    return parsed.geturl()


async def fetch_avatar_image(
    image_url: str,
    *,
    allowed_hosts: Collection[str],
    client: httpx.AsyncClient | None = None,
) -> bytes:
    """Download an allowlisted https image: no redirects, streamed with a 5 MB cap.

    Raises ``AvatarFetchError`` on any policy violation or fetch failure. Magic-byte validation
    of the returned bytes is left to ``ProfileAvatarService.upload_avatar``.
    """
    url = validate_avatar_url(image_url, allowed_hosts=allowed_hosts)
    owns_client = client is None
    http = client or httpx.AsyncClient(timeout=_FETCH_TIMEOUT_SECONDS)
    try:
        async with http.stream(
            "GET",
            url,
            headers={"User-Agent": _USER_AGENT, "Accept": "image/*"},
            follow_redirects=False,
        ) as response:
            if response.status_code != 200:
                raise AvatarFetchError("Could not fetch selected avatar image.")
            content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
            if not content_type.startswith("image/"):
                raise AvatarFetchError("Selected URL is not an image.")
            declared = response.headers.get("content-length", "")
            if declared.isdigit() and int(declared) > MAX_AVATAR_BYTES:
                raise AvatarFetchError("Image too large.")
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > MAX_AVATAR_BYTES:
                    raise AvatarFetchError("Image too large.")
                chunks.append(chunk)
            return b"".join(chunks)
    except httpx.HTTPError as exc:
        logger.warning("avatar fetch failed url=%s error=%s", url, exc)
        raise AvatarFetchError("Could not fetch selected avatar image.") from exc
    finally:
        if owns_client:
            await http.aclose()
