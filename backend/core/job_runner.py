from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import cast

from fastapi import FastAPI
from fastapi import status as http_status
from fastapi import HTTPException

from core.config import get_settings
from core.db import create_supabase_service_client
from features.uploads.workers import (
    ManualTransactionJob,
    ReceiptJob,
    VoiceJob,
    run_manual_worker,
    run_receipt_worker,
    run_voice_worker,
)


@dataclass(slots=True)
class WorkerRuntime:
    receipt_queue: asyncio.Queue[ReceiptJob]
    voice_queue: asyncio.Queue[VoiceJob]
    manual_queue: asyncio.Queue[ManualTransactionJob]
    tasks: list[asyncio.Task[None]]


def _runtime_from_app(app: FastAPI) -> WorkerRuntime:
    runtime = getattr(app.state, "worker_runtime", None)
    if not isinstance(runtime, WorkerRuntime):
        raise RuntimeError("Worker runtime is not started")
    return runtime


def _queue_full_error(kind: str) -> HTTPException:
    return HTTPException(
        status_code=http_status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"{kind} queue is full. Try again.",
    )


def enqueue_manual(app: FastAPI, job: ManualTransactionJob) -> None:
    queue = _runtime_from_app(app).manual_queue
    try:
        queue.put_nowait(job)
    except asyncio.QueueFull as exc:
        raise _queue_full_error("manual") from exc


def enqueue_receipt(app: FastAPI, job: ReceiptJob) -> None:
    queue = _runtime_from_app(app).receipt_queue
    try:
        queue.put_nowait(job)
    except asyncio.QueueFull as exc:
        raise _queue_full_error("receipt") from exc


def enqueue_voice(app: FastAPI, job: VoiceJob) -> None:
    queue = _runtime_from_app(app).voice_queue
    try:
        queue.put_nowait(job)
    except asyncio.QueueFull as exc:
        raise _queue_full_error("voice") from exc


async def start_workers(app: FastAPI) -> None:
    settings = get_settings()
    maxsize = max(1, int(settings.worker_queue_maxsize))

    runtime = WorkerRuntime(
        receipt_queue=asyncio.Queue(maxsize=maxsize),
        voice_queue=asyncio.Queue(maxsize=maxsize),
        manual_queue=asyncio.Queue(maxsize=maxsize),
        tasks=[],
    )

    client = create_supabase_service_client()
    bucket = settings.storage_bucket

    for i in range(max(1, int(settings.image_worker_count))):
        runtime.tasks.append(
            asyncio.create_task(
                run_receipt_worker(
                    worker_name=f"receipt-worker-{i + 1}",
                    queue=runtime.receipt_queue,
                    client=client,
                    bucket=bucket,
                ),
            )
        )

    for i in range(max(1, int(settings.voice_worker_count))):
        runtime.tasks.append(
            asyncio.create_task(
                run_voice_worker(
                    worker_name=f"voice-worker-{i + 1}",
                    queue=runtime.voice_queue,
                    client=client,
                    bucket=bucket,
                ),
            )
        )

    for i in range(max(1, int(settings.manual_worker_count))):
        runtime.tasks.append(
            asyncio.create_task(
                run_manual_worker(
                    worker_name=f"manual-worker-{i + 1}",
                    queue=runtime.manual_queue,
                    client=client,
                ),
            )
        )

    app.state.worker_runtime = runtime


async def stop_workers(app: FastAPI) -> None:
    runtime = getattr(app.state, "worker_runtime", None)
    if runtime is None:
        return
    runtime = cast(WorkerRuntime, runtime)
    for task in runtime.tasks:
        task.cancel()
    await asyncio.gather(*runtime.tasks, return_exceptions=True)
