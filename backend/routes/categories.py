"""Authenticated categories list."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.async_utils import run_sync
from deps import get_current_user_id, get_supabase_service_client
from features.categories.schemas import CategoryResponse, CreateCategoryRequest
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
