"""Authenticated categories list / create / update / delete."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from supabase import Client

from core.async_utils import run_sync
from deps import get_current_user_id, get_supabase_service_client
from features.categories.schemas import (
    CategoryDeleteImpactResponse,
    CategoryResponse,
    CreateCategoryRequest,
    UpdateCategoryRequest,
)
from features.categories.service import CategoryService

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> list[CategoryResponse]:
    return await run_sync(CategoryService(supabase).list_categories, user_id)


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CreateCategoryRequest,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> CategoryResponse:
    return await run_sync(CategoryService(supabase).create_custom_category, user_id, body)


@router.patch("/{category_id}", response_model=CategoryResponse)
async def patch_category(
    category_id: str,
    body: UpdateCategoryRequest,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> CategoryResponse:
    """Partial update. Absent fields are unchanged. ``budget_amount``: absent = untouched,
    ``null`` = remove the category budget, number/decimal string >= 0 = upsert it (atomic)."""
    return await run_sync(
        CategoryService(supabase).update_custom_category, user_id, category_id, body
    )


@router.get(
    "/{category_id}/delete-impact",
    response_model=CategoryDeleteImpactResponse,
)
async def category_delete_impact(
    category_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> CategoryDeleteImpactResponse:
    return await run_sync(CategoryService(supabase).get_delete_impact, user_id, category_id)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: str,
    reassign_to_category_id: str | None = Query(default=None),
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> None:
    await run_sync(
        CategoryService(supabase).delete_custom_category,
        user_id,
        category_id,
        reassign_to_category_id=reassign_to_category_id,
    )
