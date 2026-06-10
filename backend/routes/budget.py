"""Authenticated monthly budget (v1: single row per user)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.async_utils import run_sync
from deps import get_current_user_id, get_supabase_service_client
from features.budgets.category_budget_schemas import (
    CategoryBudgetItem,
    CategoryBudgetListResponse,
    CategoryBudgetUpsertBody,
)
from features.budgets.category_budget_service import CategoryBudgetService
from features.budgets.schemas import BudgetGetResponse, BudgetResponse, BudgetUpsertBody
from features.budgets.service import BudgetService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/budget", tags=["budget"])


@router.get("", response_model=BudgetGetResponse)
async def read_budget(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> BudgetGetResponse:
    try:
        service = BudgetService(supabase)
        return await run_sync(service.get_budget, user_id)
    except Exception as exc:
        logger.exception("Failed to read budget for user_id=%s", user_id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not load budget.",
        ) from exc


@router.patch("", response_model=BudgetResponse)
async def patch_budget(
    body: BudgetUpsertBody,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> BudgetResponse:
    try:
        service = BudgetService(supabase)
        return await run_sync(service.upsert_budget, user_id, body)
    except Exception as exc:
        logger.exception("Failed to upsert budget for user_id=%s", user_id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not save budget.",
        ) from exc


@router.get("/categories", response_model=CategoryBudgetListResponse)
async def list_category_budgets(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> CategoryBudgetListResponse:
    try:
        service = CategoryBudgetService(supabase)
        return await run_sync(service.list_category_budgets, user_id)
    except Exception as exc:
        logger.exception("Failed to list category budgets for user_id=%s", user_id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not load category budgets.",
        ) from exc


@router.put("/categories/{category_id}", response_model=CategoryBudgetItem)
async def put_category_budget(
    category_id: str,
    body: CategoryBudgetUpsertBody,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> CategoryBudgetItem:
    try:
        service = CategoryBudgetService(supabase)
        return await run_sync(
            service.upsert_category_budget,
            user_id,
            category_id,
            body,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to upsert category budget user_id=%s", user_id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not save category budget.",
        ) from exc


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category_budget(
    category_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> None:
    try:
        service = CategoryBudgetService(supabase)
        await run_sync(service.delete_category_budget, user_id, category_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to delete category budget user_id=%s", user_id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not remove category budget.",
        ) from exc
