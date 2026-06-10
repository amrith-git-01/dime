"""Authenticated categories list."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> list[CategoryResponse]:
    try:
        service = CategoryService(supabase)
        return await run_sync(service.list_categories, user_id)
    except Exception as exc:
        logger.exception("Failed to list categories")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not load categories.",
        ) from exc


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CreateCategoryRequest,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> CategoryResponse:
    try:
        service = CategoryService(supabase)
        return await run_sync(service.create_custom_category, user_id, body)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to create category")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not create category.",
        ) from exc


@router.patch("/{category_id}", response_model=CategoryResponse)
async def patch_category(
    category_id: str,
    body: UpdateCategoryRequest,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> CategoryResponse:
    try:
        service = CategoryService(supabase)
        return await run_sync(service.update_custom_category, user_id, category_id, body)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to update category")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not update category.",
        ) from exc


@router.get(
    "/{category_id}/delete-impact",
    response_model=CategoryDeleteImpactResponse,
)
async def category_delete_impact(
    category_id: str,
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> CategoryDeleteImpactResponse:
    try:
        service = CategoryService(supabase)
        return await run_sync(service.get_delete_impact, user_id, category_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to load category delete impact")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not load delete details.",
        ) from exc


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: str,
    reassign_to_category_id: str | None = Query(default=None),
    user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> None:
    try:
        service = CategoryService(supabase)
        await run_sync(
            service.delete_custom_category,
            user_id,
            category_id,
            reassign_to_category_id=reassign_to_category_id,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to delete category")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not delete category.",
        ) from exc
