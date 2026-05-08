"""Authenticated transaction list and manual create."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from supabase import Client

from core.job_runner import enqueue_manual, enqueue_receipt, enqueue_voice
from core.security import CurrentUser
from deps import get_current_user, get_supabase_service_client
from features.transactions.schemas import TransactionCreate, TransactionResponse
from features.transactions.service import TransactionService
from features.uploads.workers import ManualTransactionJob, ReceiptJob, VoiceJob

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionResponse])
def list_transactions(
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
) -> list[TransactionResponse]:
    try:
        return TransactionService(supabase).list_mine(user)
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
) -> dict[str, bool]:
    try:
        enqueue_manual(
            request.app,
            ManualTransactionJob(
                user_id=user.id,
                payload=body,
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
