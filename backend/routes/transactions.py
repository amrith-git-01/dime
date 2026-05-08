"""Authenticated transaction list and manual create."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.security import CurrentUser
from deps import get_current_user, get_supabase_service_client
from features.transactions.schemas import TransactionCreate, TransactionResponse
from features.transactions.service import TransactionService

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


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    body: TransactionCreate,
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
) -> TransactionResponse:
    try:
        return TransactionService(supabase).create_manual(user, body)
    except Exception as exc:
        logger.exception("Failed to create transaction for user id=%s", user.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not save transaction.",
        ) from exc
