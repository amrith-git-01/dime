from __future__ import annotations

import asyncio
from typing import Any

import pytest
from jobs_fakes import FakeJobsRepo

from core.errors import ServiceBusyError
from features.jobs.manager import JobManager
from features.jobs.repository import JobRecord


def _manager(repo: FakeJobsRepo, *, maxsize: int = 4, **kw: Any) -> JobManager:
    return JobManager(
        repo,  # type: ignore[arg-type]
        queue_maxsize=maxsize,
        recovery_age_seconds=120,
        poll_interval_seconds=0.01,
        **kw,
    )


def _sms(i: int) -> dict[str, Any]:
    return {"body": f"msg {i}", "received_at": "2026-10-04T10:00:00+00:00", "timezone": "UTC"}


async def test_submit_persists_then_enqueues_whole_batch() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo)
    result = await manager.submit(user_id="u1", kind="sms", payloads=[_sms(i) for i in range(3)])
    assert not result.replayed
    assert len(repo.rows) == 3
    assert all(r["status"] == "pending" for r in repo.rows.values())
    assert manager.queues["sms"].qsize() == 3


async def test_batch_larger_than_capacity_creates_nothing() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo, maxsize=2)
    with pytest.raises(ServiceBusyError):
        await manager.submit(user_id="u1", kind="sms", payloads=[_sms(i) for i in range(3)])
    assert repo.rows == {}
    assert manager.queues["sms"].qsize() == 0


async def test_capacity_check_accounts_for_existing_queue_content() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo, maxsize=3)
    await manager.submit(user_id="u1", kind="sms", payloads=[_sms(0), _sms(1)])
    with pytest.raises(ServiceBusyError):
        await manager.submit(user_id="u1", kind="sms", payloads=[_sms(2), _sms(3)])
    assert len(repo.rows) == 2


async def test_idempotent_submit_replays_without_new_rows() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo)
    first = await manager.submit(
        user_id="u1", kind="receipt", payloads=[{"object_path": "a"}], idempotency_keys=["key-12345678"]
    )
    again = await manager.submit(
        user_id="u1", kind="receipt", payloads=[{"object_path": "b"}], idempotency_keys=["key-12345678"]
    )
    assert again.replayed
    assert again.jobs[0].id == first.jobs[0].id
    assert len(repo.rows) == 1
    assert manager.queues["receipt"].qsize() == 1


async def test_same_key_for_different_users_is_independent() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo)
    await manager.submit(user_id="u1", kind="receipt", payloads=[{}], idempotency_keys=["key-12345678"])
    other = await manager.submit(
        user_id="u2", kind="receipt", payloads=[{}], idempotency_keys=["key-12345678"]
    )
    assert not other.replayed
    assert len(repo.rows) == 2


async def test_recover_requeues_only_stale_jobs_within_capacity() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo, maxsize=2)
    rows = repo.insert_many(
        [{"user_id": "u1", "kind": "sms", "payload": _sms(i), "status": "pending"} for i in range(4)]
    )
    stale_pending, stale_processing, third, fresh = (r["id"] for r in rows)
    repo.rows[stale_processing]["status"] = "processing"
    for job_id, age in ((stale_pending, 600), (stale_processing, 500), (third, 400)):
        repo.age(job_id, age)

    recovered = await manager.recover()

    assert recovered == 2  # bounded by queue capacity; oldest first
    assert manager.queues["sms"].qsize() == 2
    assert repo.rows[stale_processing]["status"] == "pending"
    assert fresh not in manager._queued
    assert third not in manager._queued

    # Next sweep after the queue drained picks up the rest, never duplicating queued ids.
    assert await manager.recover() == 0
    manager.queues["sms"].get_nowait()
    manager.queues["sms"].get_nowait()
    manager._queued.clear()
    assert await manager.recover() == 2  # the two still-stale ones (re-queued ids are stale too)


async def test_recover_skips_jobs_this_process_is_running() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo)
    row = repo.insert_many([{"user_id": "u1", "kind": "voice", "payload": {}, "status": "processing"}])[0]
    repo.age(row["id"], 900)
    manager._inflight.add(row["id"])
    assert await manager.recover() == 0
    assert repo.rows[row["id"]]["status"] == "processing"


async def test_worker_marks_done_with_result_and_counts_attempt() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo)
    await manager.submit(user_id="u1", kind="sms", payloads=[_sms(0)])

    async def handler(job: JobRecord) -> dict[str, Any]:
        return {"transaction_id": "tx-1", "body": job.payload["body"]}

    worker = asyncio.create_task(manager.run_worker("w", "sms", handler))
    await asyncio.wait_for(manager.queues["sms"].join(), timeout=2)
    manager.accepting = False
    await asyncio.wait_for(worker, timeout=2)

    row = next(iter(repo.rows.values()))
    assert row["status"] == "done"
    assert row["attempts"] == 1
    assert row["result"] == {"transaction_id": "tx-1", "body": "msg 0"}


async def test_worker_marks_failed_on_handler_error() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo)
    await manager.submit(user_id="u1", kind="sms", payloads=[_sms(0)])

    async def handler(job: JobRecord) -> None:
        raise RuntimeError("provider exploded")

    worker = asyncio.create_task(manager.run_worker("w", "sms", handler))
    await asyncio.wait_for(manager.queues["sms"].join(), timeout=2)
    manager.accepting = False
    await asyncio.wait_for(worker, timeout=2)

    row = next(iter(repo.rows.values()))
    assert row["status"] == "failed"
    assert "provider exploded" in row["last_error"]


async def test_duplicate_queue_entries_process_once() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo)
    result = await manager.submit(user_id="u1", kind="sms", payloads=[_sms(0)])
    manager.queues["sms"].put_nowait(result.jobs[0].id)  # simulated duplicate id
    runs: list[str] = []

    async def handler(job: JobRecord) -> None:
        runs.append(job.id)

    worker = asyncio.create_task(manager.run_worker("w", "sms", handler))
    await asyncio.wait_for(manager.queues["sms"].join(), timeout=2)
    manager.accepting = False
    await asyncio.wait_for(worker, timeout=2)
    assert runs == [result.jobs[0].id]


async def test_job_with_exhausted_attempts_is_failed_not_rerun() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo, max_attempts=2)
    row = repo.insert_many(
        [{"user_id": "u1", "kind": "sms", "payload": _sms(0), "status": "pending", "attempts": 2}]
    )[0]
    manager._put("sms", row["id"])
    ran: list[str] = []

    async def handler(job: JobRecord) -> None:
        ran.append(job.id)

    worker = asyncio.create_task(manager.run_worker("w", "sms", handler))
    await asyncio.wait_for(manager.queues["sms"].join(), timeout=2)
    manager.accepting = False
    await asyncio.wait_for(worker, timeout=2)
    assert ran == []
    assert repo.rows[row["id"]]["status"] == "failed"


async def test_shutdown_releases_unfinished_and_queued_jobs_for_recovery() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo, maxsize=4)
    result = await manager.submit(user_id="u1", kind="sms", payloads=[_sms(0), _sms(1)])
    first_id, second_id = (j.id for j in result.jobs)
    started = asyncio.Event()

    async def slow_handler(job: JobRecord) -> None:
        started.set()
        await asyncio.sleep(60)

    worker = asyncio.create_task(manager.run_worker("w", "sms", slow_handler))
    await asyncio.wait_for(started.wait(), timeout=2)
    assert repo.rows[first_id]["status"] == "processing"

    await manager.shutdown([worker], grace_seconds=0.05)

    assert worker.done()
    # In-flight job handed back to pending (and immediately eligible), queued one untouched.
    assert repo.rows[first_id]["status"] == "pending"
    assert repo.rows[second_id]["status"] == "pending"

    # "Next boot": a fresh manager recovers both right away, no 2-minute wait.
    fresh = _manager(repo)
    assert await fresh.recover() == 2
    assert fresh.queues["sms"].qsize() == 2


async def test_shutdown_lets_fast_inflight_job_finish_within_grace() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo)
    result = await manager.submit(user_id="u1", kind="sms", payloads=[_sms(0)])
    started = asyncio.Event()

    async def handler(job: JobRecord) -> dict[str, str]:
        started.set()
        await asyncio.sleep(0.1)
        return {"ok": "yes"}

    worker = asyncio.create_task(manager.run_worker("w", "sms", handler))
    await asyncio.wait_for(started.wait(), timeout=2)
    await manager.shutdown([worker], grace_seconds=2)
    assert repo.rows[result.jobs[0].id]["status"] == "done"


async def test_stops_accepting_new_work_after_shutdown() -> None:
    repo = FakeJobsRepo()
    manager = _manager(repo)
    await manager.shutdown([], grace_seconds=0.01)
    with pytest.raises(ServiceBusyError):
        await manager.submit(user_id="u1", kind="sms", payloads=[_sms(0)])
