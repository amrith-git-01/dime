from __future__ import annotations

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from core.config import Settings
from core.request_id import RequestIdMiddleware, unhandled_exception_handler


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestIdMiddleware)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    @app.get("/ok")
    def ok() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("secret provider detail: key=sk-123")

    @app.get("/expected")
    def expected() -> None:
        raise HTTPException(404, detail="Nope")

    return app


def test_unhandled_error_returns_generic_500_with_request_id() -> None:
    client = TestClient(_app(), raise_server_exceptions=False)
    response = client.get("/boom")
    assert response.status_code == 500
    body = response.json()
    assert body["detail"] == "Internal error"
    assert body["request_id"]
    assert response.headers["X-Request-ID"] == body["request_id"]
    assert "sk-123" not in response.text


def test_incoming_request_id_is_propagated_and_echoed() -> None:
    client = TestClient(_app(), raise_server_exceptions=False)
    ok = client.get("/ok", headers={"X-Request-ID": "client-req-12345"})
    assert ok.headers["X-Request-ID"] == "client-req-12345"
    boom = client.get("/boom", headers={"X-Request-ID": "client-req-12345"})
    assert boom.json()["request_id"] == "client-req-12345"


def test_unsafe_incoming_request_id_is_replaced() -> None:
    client = TestClient(_app(), raise_server_exceptions=False)
    response = client.get("/ok", headers={"X-Request-ID": "bad id\twith spaces"})
    assert response.headers["X-Request-ID"] != "bad id\twith spaces"
    assert response.headers["X-Request-ID"]


def test_http_exceptions_keep_their_status_and_get_request_id_header() -> None:
    client = TestClient(_app(), raise_server_exceptions=False)
    response = client.get("/expected")
    assert response.status_code == 404
    assert response.json() == {"detail": "Nope"}
    assert response.headers["X-Request-ID"]


def test_cors_origins_parse_comma_separated_and_default_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    base = {"SUPABASE_URL": "https://x.supabase.co", "SUPABASE_KEY": "k"}
    for key, value in base.items():
        monkeypatch.setenv(key, value)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert Settings(_env_file=None).cors_origins == []  # type: ignore[call-arg]
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example.com, https://b.example.com")
    assert Settings(_env_file=None).cors_origins == [  # type: ignore[call-arg]
        "https://a.example.com",
        "https://b.example.com",
    ]


def test_cors_middleware_without_credentials_does_not_allow_credentials() -> None:
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["https://a.example.com"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/ok")
    def ok() -> dict[str, bool]:
        return {"ok": True}

    response = TestClient(app).get("/ok", headers={"Origin": "https://a.example.com"})
    assert response.headers["access-control-allow-origin"] == "https://a.example.com"
    assert "access-control-allow-credentials" not in response.headers
