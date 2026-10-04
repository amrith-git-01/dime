"""Authenticated monthly budget (v1: single row per user) and per-category budgets."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
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

router = APIRouter(prefix="/budget", tags=["budget"])


@router.get("", response_model=BudgetGetResponse)
async def read_budget(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> BudgetGetResponse:
    return await run_sync(BudgetService(supabase).get_budget, user_id)


@router.patch("", response_model=BudgetResponse)
async def patch_budget(
    body: BudgetUpsertBody,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> BudgetResponse:
    return await run_sync(BudgetService(supabase).upsert_budget, user_id, body)


@router.get("/categories", response_model=CategoryBudgetListResponse)
async def list_category_budgets(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> CategoryBudgetListResponse:
    return await run_sync(CategoryBudgetService(supabase).list_category_budgets, user_id)


@router.put("/categories/{category_id}", response_model=CategoryBudgetItem)
async def put_category_budget(
    category_id: str,
    body: CategoryBudgetUpsertBody,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> CategoryBudgetItem:
    return await run_sync(
        CategoryBudgetService(supabase).upsert_category_budget, user_id, category_id, body
    )


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category_budget(
    category_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> None:
    await run_sync(CategoryBudgetService(supabase).delete_category_budget, user_id, category_id)
