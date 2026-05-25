"""Authenticated monthly budget (v1: single row per user)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from deps import get_current_user_id, get_supabase_service_client
from features.budgets.schemas import BudgetGetResponse, BudgetResponse, BudgetUpsertBody
from features.budgets.service import BudgetService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/budget", tags=["budget"])


@router.get("", response_model=BudgetGetResponse)
def read_budget(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> BudgetGetResponse:
    try:
        return BudgetService(supabase).get_budget(user_id)
    except Exception as exc:
        logger.exception("Failed to read budget for user_id=%s", user_id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not load budget.",
        ) from exc


@router.patch("", response_model=BudgetResponse)
def patch_budget(
    body: BudgetUpsertBody,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> BudgetResponse:
    try:
        return BudgetService(supabase).upsert_budget(user_id, body)
    except Exception as exc:
        logger.exception("Failed to upsert budget for user_id=%s", user_id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not save budget.",
        ) from exc
