from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jobs_fakes import FakeJobsRepo

from core.body_limit import ContentLengthLimitMiddleware
from core.job_runner import get_job_manager
from core.security import CurrentUser
from deps import get_current_user, get_supabase_service_client
from features.jobs.manager import JobManager
from features.uploads.storage import sign_media_urls, split_stored_media_ref
from routes import transactions as tx_routes
from utils.audio_format import detect_audio_format
from utils.image_format import detect_receipt_image_format

_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
_HEIC = b"\x00\x00\x00\x18ftypheic" + b"\x00" * 64
_M4A = b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 64
_WAV = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 32
_HTML = b"<html><script>alert(1)</script></html>"


# -- magic-byte sniffing ----------------------------------------------------------------------


def test_receipt_image_sniffing_allowlist() -> None:
    assert detect_receipt_image_format(_JPEG[:32]) == ("jpg", "image/jpeg")
    assert detect_receipt_image_format(_PNG[:32]) == ("png", "image/png")
    assert detect_receipt_image_format(_HEIC[:32]) == ("heic", "image/heic")
    assert detect_receipt_image_format(_HTML[:32]) is None
    assert detect_receipt_image_format(_M4A[:32]) is None


def test_audio_sniffing_allowlist() -> None:
    assert detect_audio_format(_M4A[:32]) == ("m4a", "audio/mp4")
    assert detect_audio_format(_WAV[:32]) == ("wav", "audio/wav")
    assert detect_audio_format(b"ID3\x04" + b"\x00" * 32) == ("mp3", "audio/mpeg")
    assert detect_audio_format(b"OggS" + b"\x00" * 32) == ("ogg", "audio/ogg")
    assert detect_audio_format(_HTML[:32]) is None
    assert detect_audio_format(_JPEG[:32]) is None


# -- upload routes (413 / 415 / sniffed mime) -------------------------------------------------


@pytest.fixture
def repo() -> FakeJobsRepo:
    return FakeJobsRepo()


@pytest.fixture
def captured(monkeypatch: pytest.MonkeyPatch, repo: FakeJobsRepo) -> dict[str, Any]:
    """``captured["receipt"]`` / ``["voice"]`` hold the persisted job payload once queued."""

    class _View(dict):  # type: ignore[type-arg]
        def __contains__(self, key: object) -> bool:
            return any(r["kind"] == key for r in repo.rows.values())

        def __getitem__(self, key: str) -> Any:
            rows = [r for r in repo.rows.values() if r["kind"] == key]
            return SimpleNamespace(**rows[-1]["payload"])

    monkeypatch.setattr(
        tx_routes,
        "get_settings",
        lambda: SimpleNamespace(
            max_receipt_upload_bytes=1024,
            max_voice_upload_bytes=2048,
            private_storage_bucket="priv",
        ),
    )
    return _View()


@pytest.fixture
def client(captured: dict[str, Any], repo: FakeJobsRepo) -> TestClient:
    app = FastAPI()
    app.add_middleware(
        ContentLengthLimitMiddleware,
        limits={"/transactions/receipt": 1024 + 4096, "/transactions/voice": 2048 + 4096},
    )
    app.include_router(tx_routes.router)
    manager = JobManager(repo, queue_maxsize=8)  # type: ignore[arg-type]
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="user-1")
    app.dependency_overrides[get_supabase_service_client] = lambda: MagicMock()
    app.dependency_overrides[get_job_manager] = lambda: manager
    return TestClient(app)


def _post(client: TestClient, path: str, data: bytes, *, content_type: str) -> Any:
    return client.post(
        f"{path}?timezone=Asia/Kolkata",
        files={"file": ("upload.bin", data, content_type)},
    )


def test_receipt_uses_sniffed_content_type_not_client_claim(
    client: TestClient, captured: dict[str, Any]
) -> None:
    response = _post(client, "/transactions/receipt", _PNG, content_type="image/jpeg")
    assert response.status_code == 202
    assert captured["receipt"].mime_type == "image/png"


def test_receipt_rejects_html_with_415(client: TestClient, captured: dict[str, Any]) -> None:
    response = _post(client, "/transactions/receipt", _HTML, content_type="image/jpeg")
    assert response.status_code == 415
    assert "receipt" not in captured


def test_receipt_over_cap_returns_413(client: TestClient, captured: dict[str, Any]) -> None:
    # Inside the multipart envelope allowance, so the in-route chunked cap must catch it.
    response = _post(client, "/transactions/receipt", _JPEG + b"\x00" * 2000, content_type="image/jpeg")
    assert response.status_code == 413
    assert "receipt" not in captured


def test_receipt_declared_content_length_over_cap_returns_413(
    client: TestClient, captured: dict[str, Any]
) -> None:
    response = _post(
        client, "/transactions/receipt", _JPEG + b"\x00" * 20_000, content_type="image/jpeg"
    )
    assert response.status_code == 413
    assert "receipt" not in captured


def test_voice_over_cap_returns_413_and_wrong_type_415(
    client: TestClient, captured: dict[str, Any]
) -> None:
    big = _post(client, "/transactions/voice", _M4A + b"\x00" * 3000, content_type="audio/mp4")
    assert big.status_code == 413
    html = _post(client, "/transactions/voice", _HTML, content_type="audio/mp4")
    assert html.status_code == 415
    assert "voice" not in captured


def test_voice_accepts_m4a_and_wav(client: TestClient, captured: dict[str, Any]) -> None:
    assert _post(client, "/transactions/voice", _M4A, content_type="audio/m4a").status_code == 202
    assert captured["voice"].mime_type == "audio/mp4"
    assert _post(client, "/transactions/voice", _WAV, content_type="audio/mp4").status_code == 202
    assert captured["voice"].mime_type == "audio/wav"


# -- private storage refs and signing ---------------------------------------------------------


def test_split_stored_media_ref_handles_paths_and_legacy_public_urls() -> None:
    assert split_stored_media_ref("receipts/u1/receipts/2026-10-04/1.jpg", default_bucket="priv") == (
        "priv",
        "receipts/u1/receipts/2026-10-04/1.jpg",
    )
    legacy = (
        "https://abc.supabase.co/storage/v1/object/public/Dime/receipts/u1/receipts/d/1.jpg?v=3"
    )
    assert split_stored_media_ref(legacy, default_bucket="priv") == (
        "Dime",
        "receipts/u1/receipts/d/1.jpg",
    )
    assert split_stored_media_ref("https://evil.example.com/x.jpg", default_bucket="priv") is None
    assert split_stored_media_ref("  ", default_bucket="priv") is None


def test_sign_media_urls_batches_per_bucket_and_maps_back() -> None:
    client = MagicMock()
    private = MagicMock()
    private.create_signed_urls.return_value = [
        {"path": "receipts/u1/a.jpg", "signedURL": "https://s/priv/a?token=1", "error": None},
        {"path": "voice_inputs/u1/b.wav", "signedURL": None, "error": "Object not found"},
    ]
    legacy = MagicMock()
    legacy.create_signed_urls.return_value = [
        {"path": "receipts/u1/old.jpg", "signedURL": "https://s/Dime/old?token=2", "error": None},
    ]
    client.storage.from_.side_effect = lambda bucket: {"priv": private, "Dime": legacy}[bucket]

    old_url = "https://abc.supabase.co/storage/v1/object/public/Dime/receipts/u1/old.jpg"
    result = sign_media_urls(
        client,
        ["receipts/u1/a.jpg", "voice_inputs/u1/b.wav", old_url, None, "receipts/u1/a.jpg"],
        default_bucket="priv",
        expires_in=21600,
    )

    assert result == {
        "receipts/u1/a.jpg": "https://s/priv/a?token=1",
        "voice_inputs/u1/b.wav": None,
        old_url: "https://s/Dime/old?token=2",
    }
    private.create_signed_urls.assert_called_once_with(
        ["receipts/u1/a.jpg", "voice_inputs/u1/b.wav"], 21600
    )
    legacy.create_signed_urls.assert_called_once_with(["receipts/u1/old.jpg"], 21600)


def test_sign_media_urls_swallows_storage_errors() -> None:
    client = MagicMock()
    client.storage.from_.return_value.create_signed_urls.side_effect = RuntimeError("down")
    result = sign_media_urls(client, ["receipts/u1/a.jpg"], default_bucket="priv", expires_in=60)
    assert result == {"receipts/u1/a.jpg": None}
