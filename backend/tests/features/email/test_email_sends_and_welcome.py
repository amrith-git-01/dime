"""B3 (email_sends claim semantics) and B5 (/me writes, welcome once, task references)."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest

from core.background import pending_background_tasks, spawn
from core.security import CurrentUser
from features.email.sends_repository import PENDING_RECLAIM_AFTER, EmailSendsRepository
from features.user_profile.service import UserProfileService


class _PgError(Exception):
    def __init__(self, code: str, message: str = "boom") -> None:
        super().__init__({"code": code, "message": message})
        self.code = code


def _repo() -> tuple[EmailSendsRepository, MagicMock]:
    db = MagicMock()
    return EmailSendsRepository(db), db


# -- B3 ----------------------------------------------------------------------------------------


def test_try_begin_inserts_pending_row_with_claimed_at() -> None:
    repo, db = _repo()
    assert repo.try_begin(user_id="u1", kind="welcome", period_key="once") is True
    row = db.table.return_value.insert.call_args.args[0]
    assert row["status"] == "pending"
    assert row["claimed_at"]


def test_non_unique_errors_propagate_instead_of_looking_claimed() -> None:
    repo, db = _repo()
    db.table.return_value.insert.return_value.execute.side_effect = _PgError("08006", "conn lost")
    with pytest.raises(_PgError):
        repo.try_begin(user_id="u1", kind="weekly", period_key="2026-W40")
    # Nothing was reclaimed either.
    db.table.return_value.update.assert_not_called()


def test_unique_violation_with_fresh_pending_row_stays_claimed() -> None:
    repo, db = _repo()
    db.table.return_value.insert.return_value.execute.side_effect = _PgError("23505")
    update_chain = db.table.return_value.update.return_value
    final = update_chain.eq.return_value.eq.return_value.eq.return_value.eq.return_value.lt
    final.return_value.execute.return_value = MagicMock(data=[])
    assert repo.try_begin(user_id="u1", kind="weekly", period_key="p") is False


def test_postgrest_409_conflict_counts_as_claimed() -> None:
    repo, db = _repo()
    db.table.return_value.insert.return_value.execute.side_effect = _PgError("409")
    update_chain = db.table.return_value.update.return_value
    final = update_chain.eq.return_value.eq.return_value.eq.return_value.eq.return_value.lt
    final.return_value.execute.return_value = MagicMock(data=[])
    assert repo.try_begin(user_id="u1", kind="weekly", period_key="p") is False


def test_stale_pending_row_is_reclaimed() -> None:
    repo, db = _repo()
    db.table.return_value.insert.return_value.execute.side_effect = _PgError("23505")
    update_chain = db.table.return_value.update.return_value
    lt = update_chain.eq.return_value.eq.return_value.eq.return_value.eq.return_value.lt
    lt.return_value.execute.return_value = MagicMock(data=[{"id": "x"}])

    assert repo.try_begin(user_id="u1", kind="monthly", period_key="2026-09") is True

    cutoff = datetime.fromisoformat(lt.call_args.args[1])
    age = datetime.now(UTC) - cutoff
    assert lt.call_args.args[0] == "claimed_at"
    assert PENDING_RECLAIM_AFTER - timedelta(seconds=5) < age < PENDING_RECLAIM_AFTER + timedelta(
        seconds=5
    )
    # Only pending rows are eligible for reclaim.
    status_eq = update_chain.eq.return_value.eq.return_value.eq.return_value.eq
    status_eq.assert_called_once_with("status", "pending")


# -- B5 ----------------------------------------------------------------------------------------


def _profile_service(row: dict | None) -> UserProfileService:
    service = UserProfileService(MagicMock())
    service._repo.fetch_by_id = MagicMock(return_value=row)
    service._repo.update_email_if_row_exists = MagicMock()
    return service


_USER = CurrentUser(id="u1", email="a@b.c")


def test_get_me_does_not_write_when_email_unchanged() -> None:
    service = _profile_service({"id": "u1", "username": "A", "email": "a@b.c"})
    me, welcome = service.get_me_with_welcome_flag(_USER)
    assert me.username == "A"
    assert welcome is False
    service._repo.update_email_if_row_exists.assert_not_called()


def test_get_me_updates_email_only_when_it_changed() -> None:
    service = _profile_service({"id": "u1", "username": "A", "email": "old@b.c"})
    _, welcome = service.get_me_with_welcome_flag(_USER)
    assert welcome is True
    service._repo.update_email_if_row_exists.assert_called_once_with("u1", "a@b.c")


def test_get_me_for_new_account_without_row_requests_welcome_but_writes_nothing() -> None:
    service = _profile_service(None)
    _, welcome = service.get_me_with_welcome_flag(_USER)
    assert welcome is True
    service._repo.update_email_if_row_exists.assert_not_called()


def test_get_me_without_email_never_welcomes() -> None:
    service = _profile_service({"id": "u1"})
    _, welcome = service.get_me_with_welcome_flag(CurrentUser(id="u1", email=None))
    assert welcome is False


async def test_spawned_tasks_are_referenced_until_done_and_errors_are_logged(
    caplog: pytest.LogCaptureFixture,
) -> None:
    gate = asyncio.Event()

    async def work() -> str:
        await gate.wait()
        return "ok"

    before = pending_background_tasks()
    task = spawn(work(), name="t1")
    assert pending_background_tasks() == before + 1

    async def boom() -> None:
        raise RuntimeError("kaput")

    bad = spawn(boom(), name="bad")
    await asyncio.sleep(0)
    await asyncio.gather(bad, return_exceptions=True)
    await asyncio.sleep(0)
    assert "background task bad failed" in caplog.text

    gate.set()
    assert await task == "ok"
    await asyncio.sleep(0)
    assert pending_background_tasks() == before
