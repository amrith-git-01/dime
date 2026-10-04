"""Authenticated transaction list, manual create, and queued capture (receipt / voice / SMS).

Unexpected errors propagate to the global handler (500 + request ID); domain errors raised by
services (``core.errors``) map to 404/409/422/503. ``ValueError`` from bad timezone input stays
a 400.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import JSONResponse
from supabase import Client

from core.async_utils import run_sync
from core.config import get_settings
from core.job_runner import get_job_manager
from core.security import CurrentUser
from deps import get_current_user, get_supabase_service_client
from features.insights.schemas import MonthInsightsResponse
from features.insights.service import InsightsService
from features.jobs.idempotency import derived_keys, parse_idempotency_key, run_idempotent
from features.jobs.manager import JobManager
from features.jobs.repository import JobsRepository
from features.transactions.schemas import (
    HomeOverviewResponse,
    MonthSummaryResponse,
    SmsBatchRequest,
    TransactionCreate,
    TransactionListResponse,
    TransactionResponse,
    TransactionUpdate,
)
from features.transactions.service import TransactionService
from features.uploads.storage import delete_object_quietly, upload_bytes
from features.uploads.validation import (
    read_upload_capped,
    sniff_receipt_content_type,
    sniff_voice_content_type,
)
from features.uploads.workers import extract_upload_extension_from_mime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transactions", tags=["transactions"])

IdempotencyKeyHeader = Annotated[
    str | None,
    Header(
        alias="Idempotency-Key",
        description="Optional UUID. The same user + key returns the original result.",
    ),
]


@router.get("/home", response_model=HomeOverviewResponse)
async def transactions_home(
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
    timezone: str = Query(..., min_length=2, max_length=80),
) -> HomeOverviewResponse:
    try:
        return await TransactionService(supabase).home_overview(user, timezone=timezone)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/month-summary", response_model=MonthSummaryResponse)
async def transactions_month_summary(
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    timezone: str = Query(..., min_length=2, max_length=80),
) -> MonthSummaryResponse:
    try:
        return await run_sync(
            TransactionService(supabase).month_summary,
            user,
            year=year,
            month=month,
            timezone=timezone,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/month-insights", response_model=MonthInsightsResponse)
async def transactions_month_insights(
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    timezone: str = Query(..., min_length=2, max_length=80),
) -> MonthInsightsResponse:
    try:
        return await run_sync(
            InsightsService(supabase).month_insights,
            user,
            year=year,
            month=month,
            timezone=timezone,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
    from_: datetime | None = Query(None, alias="from", description="Inclusive lower bound."),
    to: datetime | None = Query(None, alias="to", description="Exclusive upper bound."),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    timezone: str | None = Query(None, min_length=2, max_length=80),
) -> TransactionListResponse:
    return await run_sync(
        TransactionService(supabase).list_mine_paginated,
        user,
        from_iso=from_.isoformat() if from_ is not None else None,
        to_iso=to.isoformat() if to is not None else None,
        limit=limit,
        offset=offset,
        timezone=timezone,
    )


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(
    transaction_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
) -> TransactionResponse:
    """One transaction (same shape as list items, with fresh signed media URLs)."""
    return await run_sync(TransactionService(supabase).get_one, user, str(transaction_id))


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_transaction(
    body: TransactionCreate,
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
    timezone: str = Query(..., min_length=2, max_length=80),
    idempotency_key: IdempotencyKeyHeader = None,
) -> JSONResponse:
    """Manual transactions need no AI processing: insert synchronously so the client can refetch
    immediately after receiving 201 and see the new transaction."""
    key = parse_idempotency_key(idempotency_key)
    service = TransactionService(supabase)

    def _create() -> dict[str, bool]:
        service.create_manual(user, body, timezone=timezone)
        return {"accepted": True}

    if key is None:
        content = await run_sync(_create)
        return JSONResponse(content, status_code=status.HTTP_201_CREATED)

    status_code, content = await run_sync(
        run_idempotent,
        JobsRepository(supabase),
        user_id=user.id,
        key=key,
        kind="manual_create",
        action=_create,
        status_code=status.HTTP_201_CREATED,
    )
    return JSONResponse(content, status_code=status_code)


@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: UUID,
    body: TransactionUpdate,
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
) -> TransactionResponse:
    return await run_sync(
        TransactionService(supabase).update_manual, user, str(transaction_id), body
    )


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
) -> None:
    await run_sync(TransactionService(supabase).soft_delete, user, str(transaction_id))


_ACCEPTED = {"accepted": True}


async def _upload_and_submit(
    *,
    kind: str,
    storage_kind: str,
    content: bytes,
    content_type: str,
    fallback_ext: str,
    user: CurrentUser,
    supabase: Client,
    manager: JobManager,
    timezone: str,
    key: str | None,
) -> None:
    """Store the raw media in the private bucket, then persist + enqueue the job (path only)."""
    manager.ensure_capacity(kind, 1)
    bucket = get_settings().private_storage_bucket
    upload = await upload_bytes(
        client=supabase,
        bucket=bucket,
        user_id=user.id,
        kind=storage_kind,  # type: ignore[arg-type]
        file_bytes=content,
        content_type=content_type,
        extension=extract_upload_extension_from_mime(content_type, fallback=fallback_ext),
    )
    try:
        result = await manager.submit(
            user_id=user.id,
            kind=kind,
            payloads=[
                {
                    "object_path": upload.object_path,
                    "mime_type": content_type,
                    "timezone": timezone,
                }
            ],
            idempotency_keys=[key] if key else None,
        )
    except BaseException:
        await delete_object_quietly(
            client=supabase, bucket=bucket, object_path=upload.object_path
        )
        raise
    if result.replayed:  # lost a race with an identical request: drop the duplicate upload
        await delete_object_quietly(
            client=supabase, bucket=bucket, object_path=upload.object_path
        )


@router.post("/receipt", status_code=status.HTTP_202_ACCEPTED)
async def create_transaction_from_receipt(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
    manager: JobManager = Depends(get_job_manager),
    timezone: str = Query(..., min_length=2, max_length=80),
    idempotency_key: IdempotencyKeyHeader = None,
) -> dict[str, bool]:
    key = parse_idempotency_key(idempotency_key)
    if key and await manager.lookup(user.id, [key]):
        return dict(_ACCEPTED)
    content = await read_upload_capped(file, max_bytes=get_settings().max_receipt_upload_bytes)
    if not content:
        raise HTTPException(status_code=400, detail="uploaded file is empty")
    content_type = sniff_receipt_content_type(content)
    await _upload_and_submit(
        kind="receipt",
        storage_kind="receipts",
        content=content,
        content_type=content_type,
        fallback_ext="jpg",
        user=user,
        supabase=supabase,
        manager=manager,
        timezone=timezone,
        key=key,
    )
    return dict(_ACCEPTED)


@router.post("/voice", status_code=status.HTTP_202_ACCEPTED)
async def create_transaction_from_voice(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
    manager: JobManager = Depends(get_job_manager),
    timezone: str = Query(..., min_length=2, max_length=80),
    idempotency_key: IdempotencyKeyHeader = None,
) -> dict[str, bool]:
    key = parse_idempotency_key(idempotency_key)
    if key and await manager.lookup(user.id, [key]):
        return dict(_ACCEPTED)
    content = await read_upload_capped(file, max_bytes=get_settings().max_voice_upload_bytes)
    if not content:
        raise HTTPException(status_code=400, detail="uploaded file is empty")
    content_type = sniff_voice_content_type(content)
    await _upload_and_submit(
        kind="voice",
        storage_kind="voice_inputs",
        content=content,
        content_type=content_type,
        fallback_ext="wav",
        user=user,
        supabase=supabase,
        manager=manager,
        timezone=timezone,
        key=key,
    )
    return dict(_ACCEPTED)


@router.post("/sms", status_code=status.HTTP_202_ACCEPTED)
async def create_transactions_from_sms(
    body: SmsBatchRequest,
    user: CurrentUser = Depends(get_current_user),
    manager: JobManager = Depends(get_job_manager),
    timezone: str = Query(..., min_length=2, max_length=80),
    idempotency_key: IdempotencyKeyHeader = None,
) -> dict[str, object]:
    """Queue a batch of SMS messages, all or nothing.

    Every item was validated by the request schema (422 names the bad item) before anything is
    queued; the whole batch's capacity is reserved up front (503 with nothing queued otherwise).
    The response lists a per-message outcome: ``queued`` (with ``job_id``) or ``duplicate``
    (identical body + timestamp earlier in the same batch).
    """
    key = parse_idempotency_key(idempotency_key)

    first_index: dict[tuple[str, str], int] = {}
    outcomes: list[dict[str, object]] = []
    to_queue: list[int] = []
    for index, item in enumerate(body.messages):
        fingerprint = (item.body, item.received_at.isoformat())
        if fingerprint in first_index:
            outcomes.append(
                {"index": index, "status": "duplicate", "duplicate_of": first_index[fingerprint]}
            )
            continue
        first_index[fingerprint] = index
        outcomes.append({"index": index, "status": "queued"})
        to_queue.append(index)

    keys = derived_keys(key, len(body.messages)) if key else None
    queue_keys = [keys[i] for i in to_queue] if keys else None
    result = await manager.submit(
        user_id=user.id,
        kind="sms",
        payloads=[
            {
                "body": body.messages[i].body,
                "received_at": body.messages[i].received_at.isoformat(),
                "timezone": timezone,
            }
            for i in to_queue
        ],
        idempotency_keys=queue_keys,
    )
    for index, job in zip(to_queue, result.jobs, strict=False):
        outcomes[index]["job_id"] = job.id
    return {"accepted": True, "results": outcomes}
