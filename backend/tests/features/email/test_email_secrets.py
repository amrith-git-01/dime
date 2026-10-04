from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from deps import get_supabase_service_client
from features.email.service import EmailService
from features.email.tokens import (
    UnsubscribeSecretError,
    sign_unsubscribe_token,
    verify_unsubscribe_token,
)
from routes import email as email_routes


@pytest.mark.parametrize("secret", [None, "", "   "])
def test_token_issue_and_verify_require_secret(secret: str | None) -> None:
    with pytest.raises(UnsubscribeSecretError):
        sign_unsubscribe_token(secret=secret, user_id="u1", kind="weekly")
    with pytest.raises(UnsubscribeSecretError):
        verify_unsubscribe_token(secret=secret, token="u1|weekly|1|abc")


def test_legacy_hardcoded_secret_tokens_are_rejected() -> None:
    legacy = sign_unsubscribe_token(secret="dev-unsub-secret", user_id="u1", kind="weekly")
    assert verify_unsubscribe_token(secret="real-secret", token=legacy) is None


def _settings(**overrides: object) -> MagicMock:
    values: dict[str, object] = {
        "email_unsubscribe_secret": None,
        "email_cron_secret": None,
        "brevo_api_key": "key",
        "email_from": "Dime <hello@example.com>",
        "email_public_base_url": "http://x",
    }
    values.update(overrides)
    return MagicMock(**values)


def test_service_refuses_to_send_or_unsubscribe_without_secret() -> None:
    service = EmailService(MagicMock(), _settings())
    service._sends = MagicMock()

    service.send_welcome(user_id="u1", email="a@b.c", username=None)
    service._sends.try_begin.assert_not_called()

    assert service.run_digest("weekly") == 0
    assert service.unsubscribe("u1|weekly|1|abc") == (False, "")


def _cron_client(monkeypatch: pytest.MonkeyPatch, secret: str | None) -> TestClient:
    monkeypatch.setattr(email_routes, "get_settings", lambda: _settings(email_cron_secret=secret))
    fake_service = MagicMock()
    fake_service.return_value.run_digest.return_value = 3
    monkeypatch.setattr(email_routes, "EmailService", fake_service)
    app = FastAPI()
    app.include_router(email_routes.router)
    app.dependency_overrides[get_supabase_service_client] = lambda: MagicMock()
    return TestClient(app)


def test_cron_secret_accepts_only_exact_match(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _cron_client(monkeypatch, "s3cret")
    body = {"kind": "weekly"}
    assert client.post("/internal/email/run", json=body).status_code == 401
    wrong = client.post("/internal/email/run", json=body, headers={"X-Email-Cron-Secret": "nope"})
    assert wrong.status_code == 401
    ok = client.post("/internal/email/run", json=body, headers={"X-Email-Cron-Secret": "s3cret"})
    assert ok.status_code == 200
    assert ok.json() == {"sent": 3}


@pytest.mark.parametrize("secret", [None, ""])
def test_cron_rejected_when_configured_secret_empty(
    monkeypatch: pytest.MonkeyPatch, secret: str | None
) -> None:
    client = _cron_client(monkeypatch, secret)
    response = client.post(
        "/internal/email/run",
        json={"kind": "weekly"},
        headers={"X-Email-Cron-Secret": ""},
    )
    assert response.status_code == 401
