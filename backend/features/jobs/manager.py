"""Durable job queue: Postgres is the source of truth, asyncio queues are the fast path (B8).

Flow
----
* ``submit``: insert ``jobs`` rows (status pending), then put the ids on the in-memory queue.
  Capacity for the *whole* batch is checked before anything is inserted (B1), so a full queue
  yields a clean 503 with nothing created. If the queue fills in the tiny window after the
  insert, the rows simply stay pending and the sweeper picks them up.
* Workers ``claim`` (pending -> processing, attempts + 1), run the handler, then mark
  done/failed. Duplicate ids on the queue are harmless: only one claim can win.
* ``recover`` (startup + periodic sweep) re-enqueues pending/processing rows older than
  ``recovery_age_seconds`` that this process is not already holding, bounded by free queue
  capacity per kind.
* ``shutdown`` (SIGTERM): stop accepting, let in-flight handlers finish for ``grace`` seconds,
  cancel the rest, and hand unfinished/queued rows back to ``pending``.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from core.async_utils import run_sync
from core.db_errors import is_unique_violation
from core.errors import ServiceBusyError
from features.jobs.repository import JobRecord, JobsRepository

logger = logging.getLogger(__name__)

QUEUED_KINDS = ("receipt", "voice", "sms")

JobHandler = Callable[[JobRecord], Awaitable[dict[str, Any] | None]]


@dataclass(slots=True, frozen=True)
class SubmitResult:
    jobs: list[JobRecord]
    replayed: bool


class JobManager:
    def __init__(
        self,
        repo: JobsRepository,
        *,
        queue_maxsize: int,
        recovery_age_seconds: int = 120,
        max_attempts: int = 3,
        poll_interval_seconds: float = 1.0,
    ) -> None:
        self.repo = repo
        self.queues: dict[str, asyncio.Queue[str]] = {
            kind: asyncio.Queue(maxsize=max(1, queue_maxsize)) for kind in QUEUED_KINDS
        }
        self.recovery_age_seconds = recovery_age_seconds
        self.max_attempts = max_attempts
        self._poll = poll_interval_seconds
        self._queued: set[str] = set()
        self._inflight: set[str] = set()
        self.accepting = True

    # -- capacity / enqueue --------------------------------------------------------------------

    def free_capacity(self, kind: str) -> int:
        queue = self.queues[kind]
        return queue.maxsize - queue.qsize()

    def ensure_capacity(self, kind: str, count: int = 1) -> None:
        if not self.accepting:
            raise ServiceBusyError("Server is restarting. Try again shortly.")
        if self.free_capacity(kind) < count:
            raise ServiceBusyError(f"{kind} queue is full. Try again.")

    def _put(self, kind: str, job_id: str) -> bool:
        if job_id in self._queued or job_id in self._inflight:
            return True
        try:
            self.queues[kind].put_nowait(job_id)
        except asyncio.QueueFull:
            return False
        self._queued.add(job_id)
        return True

    async def lookup(self, user_id: str, keys: list[str]) -> list[JobRecord]:
        rows = await run_sync(self.repo.find_by_keys, user_id, keys)
        return [JobRecord.from_row(r) for r in rows]

    async def submit(
        self,
        *,
        user_id: str,
        kind: str,
        payloads: list[dict[str, Any]],
        idempotency_keys: list[str] | None = None,
    ) -> SubmitResult:
        """Persist and enqueue ``payloads`` (all or nothing). Replays return the existing jobs."""
        keys: list[str | None] = list(idempotency_keys) if idempotency_keys else [None] * len(
            payloads
        )
        if idempotency_keys:
            existing = await self.lookup(user_id, [k for k in keys if k])
            if existing:
                return SubmitResult(self._ordered(existing, keys), replayed=True)

        self.ensure_capacity(kind, len(payloads))
        rows = [
            {
                "user_id": user_id,
                "kind": kind,
                "payload": payload,
                "status": "pending",
                "attempts": 0,
                "idempotency_key": key,
            }
            for payload, key in zip(payloads, keys, strict=True)
        ]
        try:
            inserted = await run_sync(self.repo.insert_many, rows)
        except Exception as exc:
            if idempotency_keys and is_unique_violation(exc):
                existing = await self.lookup(user_id, [k for k in keys if k])
                if existing:
                    return SubmitResult(self._ordered(existing, keys), replayed=True)
            raise
        jobs = [JobRecord.from_row(r) for r in inserted]
        for job in jobs:
            if not self._put(kind, job.id):
                logger.warning("job_left_pending_queue_full id=%s kind=%s", job.id, kind)
        return SubmitResult(jobs, replayed=False)

    @staticmethod
    def _ordered(jobs: list[JobRecord], keys: list[str | None]) -> list[JobRecord]:
        by_key = {j.idempotency_key: j for j in jobs}
        ordered = [by_key[k] for k in keys if k in by_key]
        return ordered or jobs

    # -- recovery ------------------------------------------------------------------------------

    async def recover(self) -> int:
        """Re-enqueue stale pending/processing jobs, oldest first, within free queue capacity."""
        if not self.accepting:
            return 0
        cutoff = (datetime.now(UTC) - timedelta(seconds=self.recovery_age_seconds)).isoformat()
        recovered = 0
        for kind in QUEUED_KINDS:
            free = self.free_capacity(kind)
            if free <= 0:
                continue
            held = len(self._queued) + len(self._inflight)
            rows = await run_sync(
                self.repo.list_recoverable, kind=kind, cutoff_iso=cutoff, limit=free + held
            )
            for row in rows:
                if self.free_capacity(kind) <= 0:
                    break
                job_id = str(row["id"])
                if job_id in self._queued or job_id in self._inflight:
                    continue
                if row.get("status") == "processing":
                    ok = await run_sync(
                        self.repo.requeue_stale_processing, job_id, cutoff_iso=cutoff
                    )
                    if not ok:
                        continue
                if self._put(kind, job_id):
                    recovered += 1
        if recovered:
            logger.info("jobs_recovered count=%d", recovered)
        return recovered

    def _release(self, job_id: str) -> None:
        # Backdate updated_at by the recovery age so the next boot / sweep takes it immediately.
        self.repo.release(job_id, eligible_after_seconds=self.recovery_age_seconds)

    # -- workers -------------------------------------------------------------------------------

    async def run_worker(self, name: str, kind: str, handler: JobHandler) -> None:
        queue = self.queues[kind]
        while self.accepting:
            try:
                job_id = await asyncio.wait_for(queue.get(), timeout=self._poll)
            except TimeoutError:
                continue
            self._queued.discard(job_id)
            try:
                await self._process(name, job_id, handler)
            except Exception:
                logger.exception("%s crashed while handling job id=%s", name, job_id)
            finally:
                queue.task_done()

    async def _process(self, name: str, job_id: str, handler: JobHandler) -> None:
        self._inflight.add(job_id)
        try:
            if not self.accepting:  # popped just as shutdown began: leave it for the next boot
                await run_sync(self._release, job_id)
                return
            row = await run_sync(self.repo.claim, job_id, max_attempts=self.max_attempts)
            if row is None:
                return
            job = JobRecord.from_row(row)
            try:
                result = await handler(job)
            except asyncio.CancelledError:
                # Shutdown grace expired mid-job: give it back so the next boot resumes it.
                await run_sync(self._release, job_id)
                raise
            except Exception as exc:
                logger.exception("%s failed job id=%s kind=%s", name, job_id, job.kind)
                await run_sync(self.repo.mark_failed, job_id, f"{type(exc).__name__}: {exc}")
                return
            await run_sync(self.repo.mark_done, job_id, result)
        finally:
            self._inflight.discard(job_id)

    # -- shutdown ------------------------------------------------------------------------------

    async def shutdown(self, worker_tasks: list[asyncio.Task[None]], *, grace_seconds: float) -> None:
        self.accepting = False
        if worker_tasks:
            _, pending = await asyncio.wait(worker_tasks, timeout=grace_seconds)
            for task in pending:
                task.cancel()
            if pending:
                logger.warning("jobs_shutdown_cancelled_inflight count=%d", len(pending))
                await asyncio.gather(*pending, return_exceptions=True)
        leftovers = list(self._queued)
        self._queued.clear()
        if leftovers:
            await asyncio.gather(
                *(run_sync(self._release, job_id) for job_id in leftovers),
                return_exceptions=True,
            )
