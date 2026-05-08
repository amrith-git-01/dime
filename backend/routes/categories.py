"""Authenticated categories list."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from deps import get_current_user_id, get_supabase_service_client
from features.categories.schemas import CategoryResponse
from features.categories.service import CategoryService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
def list_categories(
    _user_id: str = Depends(get_current_user_id),
    supabase: Client = Depends(get_supabase_service_client),
) -> list[CategoryResponse]:
    try:
        return CategoryService(supabase).list_categories()
    except Exception as exc:
        logger.exception("Failed to list categories")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not load categories.",
        ) from exc
