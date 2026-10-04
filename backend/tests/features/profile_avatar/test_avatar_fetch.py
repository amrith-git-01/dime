from __future__ import annotations

from collections.abc import Callable

import httpx
import pytest

from features.profile_avatar.fetch import AvatarFetchError, fetch_avatar_image
from features.profile_avatar.service import MAX_AVATAR_BYTES

_HOSTS = ["api.dicebear.com"]
_GOOD_URL = "https://api.dicebear.com/7.x/adventurer-neutral/png?seed=abc&size=256"
_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _client(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _ok(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, headers={"content-type": "image/png"}, content=_PNG)


async def test_fetches_allowlisted_https_image() -> None:
    async with _client(_ok) as client:
        data = await fetch_avatar_image(_GOOD_URL, allowed_hosts=_HOSTS, client=client)
    assert data == _PNG


@pytest.mark.parametrize(
    "url",
    [
        "http://169.254.169.254/latest/meta-data/",
        "http://localhost/avatar.png",
        "https://127.0.0.1/avatar.png",
        "https://10.0.0.5/avatar.png",
        "https://[::1]/avatar.png",
        "https://evil.example.com/avatar.png",
        "https://api.dicebear.com.evil.example.com/x.png",
        "https://api.dicebear.com@evil.example.com/x.png",
        "https://user:pw@api.dicebear.com/x.png",
        "https://api.dicebear.com:8443/x.png",
        "http://api.dicebear.com/x.png",
        "ftp://api.dicebear.com/x.png",
        "file:///etc/passwd",
        "not a url",
    ],
)
async def test_rejects_disallowed_urls_without_any_request(url: str) -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no network request should be made")

    async with _client(boom) as client:
        with pytest.raises(AvatarFetchError):
            await fetch_avatar_image(url, allowed_hosts=_HOSTS, client=client)


async def test_does_not_follow_redirects_to_private_hosts() -> None:
    seen: list[str] = []

    def redirect(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(302, headers={"location": "http://169.254.169.254/secret"})

    async with _client(redirect) as client:
        with pytest.raises(AvatarFetchError):
            await fetch_avatar_image(_GOOD_URL, allowed_hosts=_HOSTS, client=client)
    assert seen == [_GOOD_URL]


async def test_rejects_non_image_content_type() -> None:
    def html(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "text/html"}, content=b"<html>")

    async with _client(html) as client:
        with pytest.raises(AvatarFetchError, match="not an image"):
            await fetch_avatar_image(_GOOD_URL, allowed_hosts=_HOSTS, client=client)


async def test_rejects_oversized_streamed_body() -> None:
    def big(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "image/png"},
            content=b"\x00" * (MAX_AVATAR_BYTES + 1),
        )

    async with _client(big) as client:
        with pytest.raises(AvatarFetchError, match="too large"):
            await fetch_avatar_image(_GOOD_URL, allowed_hosts=_HOSTS, client=client)


async def test_rejects_non_200_status() -> None:
    def not_found(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    async with _client(not_found) as client:
        with pytest.raises(AvatarFetchError):
            await fetch_avatar_image(_GOOD_URL, allowed_hosts=_HOSTS, client=client)
