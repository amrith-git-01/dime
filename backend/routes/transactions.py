"""Authenticated transaction list and manual create."""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from supabase import Client

from core.async_utils import run_sync
from core.job_runner import enqueue_manual, enqueue_receipt, enqueue_voice
from core.security import CurrentUser
from deps import get_current_user, get_supabase_service_client
from features.transactions.schemas import (
    HomeOverviewResponse,
    MonthSummaryResponse,
    TransactionCreate,
    TransactionListResponse,
)
from features.transactions.service import TransactionService
from features.uploads.workers import ManualTransactionJob, ReceiptJob, VoiceJob

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transactions", tags=["transactions"])


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
    except Exception as exc:
        logger.exception("Failed home overview for user id=%s", user.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not load home overview.",
        ) from exc


@router.get("/month-summary", response_model=MonthSummaryResponse)
async def transactions_month_summary(
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    timezone: str = Query(..., min_length=2, max_length=80),
) -> MonthSummaryResponse:
    try:
        service = TransactionService(supabase)
        return await run_sync(
            service.month_summary,
            user,
            year=year,
            month=month,
            timezone=timezone,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed month summary for user id=%s", user.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not load month summary.",
        ) from exc


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> TransactionListResponse:
    try:
        from_iso = from_.isoformat() if from_ is not None else None
        to_iso = to.isoformat() if to is not None else None
        service = TransactionService(supabase)
        return await run_sync(
            service.list_mine_paginated,
            user,
            from_iso=from_iso,
            to_iso=to_iso,
            limit=limit,
            offset=offset,
        )
    except Exception as exc:
        logger.exception("Failed to list transactions for user id=%s", user.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not load transactions.",
        ) from exc


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_transaction(
    request: Request,
    body: TransactionCreate,
    user: CurrentUser = Depends(get_current_user),
    _supabase: Client = Depends(get_supabase_service_client),
    timezone: str = Query(..., min_length=2, max_length=80),
) -> dict[str, bool]:
    try:
        enqueue_manual(
            request.app,
            ManualTransactionJob(
                user_id=user.id,
                payload=body,
                timezone=timezone,
            ),
        )
        return {"accepted": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to enqueue manual transaction for user id=%s", user.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not queue transaction.",
        ) from exc


@router.post("/receipt", status_code=status.HTTP_202_ACCEPTED)
async def create_transaction_from_receipt(
    request: Request,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    _supabase: Client = Depends(get_supabase_service_client),
    timezone: str = Query(..., min_length=2, max_length=80),
) -> dict[str, bool]:
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="uploaded file is empty")
        enqueue_receipt(
            request.app,
            ReceiptJob(
                user_id=user.id,
                file_bytes=content,
                mime_type=file.content_type or "application/octet-stream",
                timezone=timezone,
            ),
        )
        return {"accepted": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to enqueue receipt transaction for user id=%s", user.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not queue receipt transaction.",
        ) from exc


@router.post("/voice", status_code=status.HTTP_202_ACCEPTED)
async def create_transaction_from_voice(
    request: Request,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    _supabase: Client = Depends(get_supabase_service_client),
    timezone: str = Query(..., min_length=2, max_length=80),
) -> dict[str, bool]:
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="uploaded file is empty")
        enqueue_voice(
            request.app,
            VoiceJob(
                user_id=user.id,
                file_bytes=content,
                mime_type=file.content_type or "application/octet-stream",
                timezone=timezone,
            ),
        )
        return {"accepted": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to enqueue voice transaction for user id=%s", user.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not queue voice transaction.",
        ) from exc
