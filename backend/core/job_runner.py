"""Wires the durable ``JobManager`` into the app lifespan (B8).

Receipt / voice / SMS work is persisted in ``public.jobs`` and processed by in-process workers.
Startup recovers unfinished rows; shutdown stops taking jobs, gives in-flight ones a grace
period, and hands the rest back to ``pending`` (see ``features/jobs/manager.py``).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime

from fastapi import FastAPI, Request
from supabase import Client

from core.async_utils import run_sync
from core.background import spawn
from core.config import get_settings
from core.db import create_supabase_service_client
from features.email.postcard_storage import sync_welcome_postcards
from features.email.ticker import run_email_ticker
from features.jobs.manager import JobHandler, JobManager
from features.jobs.repository import JobRecord, JobsRepository
from features.uploads.workers import (
    ReceiptJob,
    SmsJob,
    VoiceJob,
    process_receipt_job,
    process_sms_job,
    process_voice_job,
)

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class WorkerRuntime:
    manager: JobManager
    worker_tasks: list[asyncio.Task[None]] = field(default_factory=list)
    service_tasks: list[asyncio.Task[None]] = field(default_factory=list)


def get_job_manager(request: Request) -> JobManager:
    """FastAPI dependency: the running job manager."""
    manager = getattr(request.app.state, "job_manager", None)
    if not isinstance(manager, JobManager):
        raise RuntimeError("Job manager is not started")
    return manager


def _handlers(client: Client, bucket: str) -> dict[str, JobHandler]:
    async def receipt(job: JobRecord) -> dict[str, str]:
        p = job.payload
        created = await process_receipt_job(
            client=client,
            bucket=bucket,
            job=ReceiptJob(
                user_id=job.user_id,
                object_path=str(p["object_path"]),
                mime_type=str(p["mime_type"]),
                timezone=str(p["timezone"]),
            ),
        )
        return {"transaction_id": str(created.id)}

    async def voice(job: JobRecord) -> dict[str, str]:
        p = job.payload
        created = await process_voice_job(
            client=client,
            bucket=bucket,
            job=VoiceJob(
                user_id=job.user_id,
                object_path=str(p["object_path"]),
                mime_type=str(p["mime_type"]),
                timezone=str(p["timezone"]),
            ),
        )
        return {"transaction_id": str(created.id)}

    async def sms(job: JobRecord) -> dict[str, str]:
        p = job.payload
        created = await process_sms_job(
            client=client,
            job=SmsJob(
                user_id=job.user_id,
                body=str(p["body"]),
                received_at=datetime.fromisoformat(str(p["received_at"])),
                timezone=str(p["timezone"]),
            ),
        )
        return {"transaction_id": str(created.id)}

    return {"receipt": receipt, "voice": voice, "sms": sms}


async def _sync_postcards(client: Client) -> None:
    """Best effort: a Storage hiccup must never block or crash startup."""
    try:
        await run_sync(sync_welcome_postcards, client=client, settings=get_settings())
    except Exception:
        logger.exception("welcome postcard sync failed; continuing startup")


async def _run_sweeper(manager: JobManager, interval_seconds: float) -> None:
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await manager.recover()
        except Exception:
            logger.exception("job sweep failed")


async def start_workers(app: FastAPI) -> None:
    settings = get_settings()
    client = create_supabase_service_client()
    # Receipts and voice notes live in the private bucket; avatars/email assets stay public.
    bucket = settings.private_storage_bucket

    manager = JobManager(
        JobsRepository(client),
        queue_maxsize=settings.worker_queue_maxsize,
        recovery_age_seconds=settings.jobs_recovery_min_age_seconds,
        max_attempts=settings.jobs_max_attempts,
    )
    runtime = WorkerRuntime(manager=manager)
    handlers = _handlers(client, bucket)
    counts = {
        "receipt": settings.image_worker_count,
        "voice": settings.voice_worker_count,
        "sms": settings.sms_worker_count,
    }
    for kind, count in counts.items():
        for i in range(max(1, int(count))):
            name = f"{kind}-worker-{i + 1}"
            runtime.worker_tasks.append(
                asyncio.create_task(manager.run_worker(name, kind, handlers[kind]), name=name)
            )

    runtime.service_tasks.append(asyncio.create_task(run_email_ticker(app, client)))
    runtime.service_tasks.append(
        asyncio.create_task(_run_sweeper(manager, settings.jobs_sweep_interval_seconds))
    )

    app.state.job_manager = manager
    app.state.worker_runtime = runtime
    spawn(_sync_postcards(client), name="sync-welcome-postcards")

    try:
        await manager.recover()
    except Exception:
        # Jobs table missing / DB down: the periodic sweep will retry.
        logger.exception("startup job recovery failed; the sweeper will retry")


async def stop_workers(app: FastAPI) -> None:
    runtime = getattr(app.state, "worker_runtime", None)
    if not isinstance(runtime, WorkerRuntime):
        return
    for task in runtime.service_tasks:
        task.cancel()
    await asyncio.gather(*runtime.service_tasks, return_exceptions=True)
    await runtime.manager.shutdown(
        runtime.worker_tasks,
        grace_seconds=get_settings().jobs_shutdown_grace_seconds,
    )
