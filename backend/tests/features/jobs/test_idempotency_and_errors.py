from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jobs_fakes import FakeJobsRepo

from core.db_errors import is_unique_violation
from core.errors import (
    ConflictError,
    DomainValidationError,
    NotFoundError,
    register_domain_error_handlers,
)
from features.jobs.idempotency import derived_keys, parse_idempotency_key, run_idempotent

_KEY = "5c0e7d9e-3b0f-4f3c-9a55-0c1d2e3f4a5b"


def test_key_parsing() -> None:
    assert parse_idempotency_key(None) is None
    assert parse_idempotency_key("   ") is None
    assert parse_idempotency_key(f" {_KEY} ") == _KEY
    assert parse_idempotency_key("a" * 100) == "a" * 100
    for bad in ("short", "a" * 101, "has space here", "emoji-\U0001f600-key-1"):
        with pytest.raises(DomainValidationError):
            parse_idempotency_key(bad)


def test_derived_keys_are_indexed() -> None:
    assert derived_keys("k", 2) == ["k:0", "k:1"]


def test_run_idempotent_executes_once_and_replays_stored_response() -> None:
    repo = FakeJobsRepo()
    calls: list[int] = []

    def action() -> dict[str, bool]:
        calls.append(1)
        return {"accepted": True}

    kwargs = {"user_id": "u1", "key": _KEY, "kind": "manual_create", "action": action}
    first = run_idempotent(repo, **kwargs)  # type: ignore[arg-type]
    second = run_idempotent(repo, **kwargs)  # type: ignore[arg-type]
    assert first == second == (201, {"accepted": True})
    assert len(calls) == 1


def test_run_idempotent_in_progress_is_conflict() -> None:
    repo = FakeJobsRepo()
    repo.insert_many(
        [{"user_id": "u1", "kind": "manual_create", "status": "processing", "idempotency_key": _KEY}]
    )
    with pytest.raises(ConflictError):
        run_idempotent(repo, user_id="u1", key=_KEY, kind="manual_create", action=lambda: {})  # type: ignore[arg-type]


def test_run_idempotent_failure_marks_failed_and_reraises() -> None:
    repo = FakeJobsRepo()

    def action() -> dict[str, bool]:
        raise RuntimeError("nope")

    with pytest.raises(RuntimeError):
        run_idempotent(repo, user_id="u1", key=_KEY, kind="manual_create", action=action)  # type: ignore[arg-type]
    assert next(iter(repo.rows.values()))["status"] == "failed"


def test_domain_errors_map_to_http_statuses() -> None:
    app = FastAPI()
    register_domain_error_handlers(app)

    @app.get("/nf")
    def nf() -> None:
        raise NotFoundError("Thing not found.")

    @app.get("/cf")
    def cf() -> None:
        raise ConflictError("Already there.")

    @app.get("/vd")
    def vd() -> None:
        raise DomainValidationError("Bad input.")

    client = TestClient(app)
    assert client.get("/nf").status_code == 404
    assert client.get("/nf").json() == {"detail": "Thing not found."}
    assert client.get("/cf").status_code == 409
    assert client.get("/vd").status_code == 422


def test_unique_violation_detection_is_strict() -> None:
    class Pg(Exception):
        def __init__(self, code: str) -> None:
            super().__init__({"code": code})
            self.code = code

    assert is_unique_violation(Pg("23505"))
    assert is_unique_violation(Pg("409"))
    assert is_unique_violation(Exception("duplicate key value violates unique constraint"))
    assert not is_unique_violation(Pg("08006"))
    assert not is_unique_violation(Exception("connection reset"))
