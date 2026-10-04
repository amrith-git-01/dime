"""SMS batch (B1), Idempotency-Key replay (C2), and GET /transactions/{id}."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jobs_fakes import FakeJobsRepo

from core.errors import NotFoundError, register_domain_error_handlers
from core.job_runner import get_job_manager
from core.security import CurrentUser
from deps import get_current_user, get_supabase_service_client
from features.jobs.manager import JobManager
from routes import transactions as tx_routes

_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
_KEY = "5c0e7d9e-3b0f-4f3c-9a55-0c1d2e3f4a5b"
_TX = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
_TZ = "?timezone=Asia/Kolkata"


def _sms(body: str, at: str = "2026-10-04T10:00:00+00:00") -> dict[str, str]:
    return {"body": body, "received_at": at}


@pytest.fixture
def repo() -> FakeJobsRepo:
    return FakeJobsRepo()


@pytest.fixture
def manager(repo: FakeJobsRepo) -> JobManager:
    return JobManager(repo, queue_maxsize=4)  # type: ignore[arg-type]


@pytest.fixture
def client(
    monkeypatch: pytest.MonkeyPatch, repo: FakeJobsRepo, manager: JobManager
) -> TestClient:
    monkeypatch.setattr(
        tx_routes,
        "get_settings",
        lambda: SimpleNamespace(
            max_receipt_upload_bytes=1 << 20,
            max_voice_upload_bytes=1 << 20,
            private_storage_bucket="priv",
        ),
    )
    monkeypatch.setattr(tx_routes, "JobsRepository", lambda _db: repo)
    app = FastAPI()
    register_domain_error_handlers(app)
    app.include_router(tx_routes.router)
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="user-1")
    app.dependency_overrides[get_supabase_service_client] = lambda: MagicMock()
    app.dependency_overrides[get_job_manager] = lambda: manager
    return TestClient(app)


# -- B1: SMS batch -----------------------------------------------------------------------------


def test_sms_batch_queues_all_with_per_item_results(client: TestClient, repo: FakeJobsRepo) -> None:
    messages = [_sms("a"), _sms("b"), _sms("a")]  # third is a duplicate of the first
    response = client.post(f"/transactions/sms{_TZ}", json={"messages": messages})
    assert response.status_code == 202
    body = response.json()
    assert body["accepted"] is True
    statuses = [r["status"] for r in body["results"]]
    assert statuses == ["queued", "queued", "duplicate"]
    assert body["results"][2]["duplicate_of"] == 0
    assert len(repo.rows) == 2
    assert all(r["payload"]["timezone"] == "Asia/Kolkata" for r in repo.rows.values())


def test_sms_batch_over_capacity_is_503_and_queues_nothing(
    client: TestClient, repo: FakeJobsRepo
) -> None:
    messages = [_sms(f"m{i}") for i in range(5)]  # capacity is 4
    response = client.post(f"/transactions/sms{_TZ}", json={"messages": messages})
    assert response.status_code == 503
    assert repo.rows == {}


def test_sms_batch_with_invalid_item_is_422_and_queues_nothing(
    client: TestClient, repo: FakeJobsRepo
) -> None:
    response = client.post(
        f"/transactions/sms{_TZ}", json={"messages": [_sms("ok"), _sms("   ")]}
    )
    assert response.status_code == 422
    assert repo.rows == {}


# -- C2: idempotency ---------------------------------------------------------------------------


def test_sms_batch_replay_returns_same_body_without_new_jobs(
    client: TestClient, repo: FakeJobsRepo
) -> None:
    payload = {"messages": [_sms("a"), _sms("b")]}
    headers = {"Idempotency-Key": _KEY}
    first = client.post(f"/transactions/sms{_TZ}", json=payload, headers=headers)
    second = client.post(f"/transactions/sms{_TZ}", json=payload, headers=headers)
    assert first.status_code == second.status_code == 202
    assert first.json() == second.json()
    assert len(repo.rows) == 2


def test_receipt_replay_does_not_requeue_or_reupload(
    client: TestClient, repo: FakeJobsRepo
) -> None:
    files = {"file": ("r.jpg", _JPEG, "image/jpeg")}
    first = client.post(f"/transactions/receipt{_TZ}", files=files, headers={"Idempotency-Key": _KEY})
    assert first.status_code == 202
    assert len(repo.rows) == 1
    only = next(iter(repo.rows.values()))
    assert only["payload"]["object_path"].startswith("receipts/user-1/")
    assert only["idempotency_key"] == _KEY

    second = client.post(f"/transactions/receipt{_TZ}", files=files, headers={"Idempotency-Key": _KEY})
    assert second.status_code == 202
    assert second.json() == first.json()
    assert len(repo.rows) == 1


def test_invalid_idempotency_key_is_422(client: TestClient) -> None:
    response = client.post(
        f"/transactions/sms{_TZ}",
        json={"messages": [_sms("a")]},
        headers={"Idempotency-Key": "short"},
    )
    assert response.status_code == 422


def test_manual_create_replay_returns_stored_response_without_second_insert(
    monkeypatch: pytest.MonkeyPatch, client: TestClient, repo: FakeJobsRepo
) -> None:
    created: list[Any] = []

    class _Service:
        def __init__(self, _db: Any) -> None: ...

        def create_manual(self, user: Any, body: Any, *, timezone: str) -> None:
            created.append(body)

    monkeypatch.setattr(tx_routes, "TransactionService", _Service)
    body = {
        "amount": "12.50",
        "type": "debit",
        "counterparty_name": "Cafe",
        "transaction_at": "2026-10-04T10:00:00+00:00",
    }
    headers = {"Idempotency-Key": _KEY}
    first = client.post(f"/transactions{_TZ}", json=body, headers=headers)
    second = client.post(f"/transactions{_TZ}", json=body, headers=headers)
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json() == {"accepted": True}
    assert len(created) == 1
    (row,) = repo.rows.values()
    assert row["kind"] == "manual_create"
    assert row["status"] == "done"
    assert row["result"] == {"status_code": 201, "body": {"accepted": True}}


def test_manual_create_without_key_always_inserts(
    monkeypatch: pytest.MonkeyPatch, client: TestClient, repo: FakeJobsRepo
) -> None:
    created: list[Any] = []

    class _Service:
        def __init__(self, _db: Any) -> None: ...

        def create_manual(self, user: Any, body: Any, *, timezone: str) -> None:
            created.append(body)

    monkeypatch.setattr(tx_routes, "TransactionService", _Service)
    body = {
        "amount": "1",
        "type": "credit",
        "counterparty_name": "X",
        "transaction_at": "2026-10-04T10:00:00+00:00",
    }
    assert client.post(f"/transactions{_TZ}", json=body).status_code == 201
    assert client.post(f"/transactions{_TZ}", json=body).status_code == 201
    assert len(created) == 2
    assert repo.rows == {}


def test_manual_create_failure_marks_job_failed_and_allows_retry(
    monkeypatch: pytest.MonkeyPatch, client: TestClient, repo: FakeJobsRepo
) -> None:
    calls = {"n": 0}

    class _Service:
        def __init__(self, _db: Any) -> None: ...

        def create_manual(self, user: Any, body: Any, *, timezone: str) -> None:
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("db down")

    monkeypatch.setattr(tx_routes, "TransactionService", _Service)
    body = {
        "amount": "1",
        "type": "credit",
        "counterparty_name": "X",
        "transaction_at": "2026-10-04T10:00:00+00:00",
    }
    headers = {"Idempotency-Key": _KEY}
    failing = TestClient(client.app, raise_server_exceptions=False)
    assert failing.post(f"/transactions{_TZ}", json=body, headers=headers).status_code == 500
    assert next(iter(repo.rows.values()))["status"] == "failed"
    assert client.post(f"/transactions{_TZ}", json=body, headers=headers).status_code == 201
    assert next(iter(repo.rows.values()))["status"] == "done"


# -- GET /transactions/{id} --------------------------------------------------------------------


def test_get_transaction_returns_item_and_does_not_shadow_static_routes(
    monkeypatch: pytest.MonkeyPatch, client: TestClient
) -> None:
    class _Service:
        def __init__(self, _db: Any) -> None: ...

        def get_one(self, user: Any, transaction_id: str) -> dict[str, Any]:
            if transaction_id != _TX:
                raise NotFoundError("Transaction not found.")
            return {
                "id": _TX,
                "user_id": "user-1",
                "amount": "10.00",
                "type": "debit",
                "counterparty_name": "Cafe",
                "merchant": "Cafe",
                "counterparty_type": None,
                "counterparty_normalized": None,
                "category": None,
                "note": None,
                "detected_via": "manual",
                "deleted_at": None,
                "transaction_at": "2026-10-04T10:00:00+00:00",
                "created_at": "2026-10-04T10:00:00+00:00",
                "updated_at": "2026-10-04T10:00:00+00:00",
                "receipt_url": "https://signed/receipt?token=1",
            }

    monkeypatch.setattr(tx_routes, "TransactionService", _Service)
    ok = client.get(f"/transactions/{_TX}")
    assert ok.status_code == 200
    assert ok.json()["id"] == _TX
    assert ok.json()["receipt_url"] == "https://signed/receipt?token=1"

    missing = client.get("/transactions/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    assert missing.status_code == 404

    # Non-UUID path segments are rejected, so /home etc. can never be mistaken for an id.
    assert client.get("/transactions/not-a-uuid").status_code == 422
