"""Categories read/create orchestration."""

from __future__ import annotations

import logging
import re

from fastapi import HTTPException, status
from supabase import Client

from features.categories.repository import CategoryRepository
from features.categories.schemas import (
    CategoryDeleteImpactResponse,
    CategoryResponse,
    CreateCategoryRequest,
    UpdateCategoryRequest,
)

MAX_CUSTOM_CATEGORIES_PER_USER = 15
DEFAULT_CUSTOM_ICON = "Tag"
DEFAULT_CUSTOM_COLOR = "#94A3B8"

logger = logging.getLogger(__name__)


class CategoryService:
    def __init__(self, supabase: Client) -> None:
        self._repo = CategoryRepository(supabase)

    def list_categories(self, user_id: str) -> list[CategoryResponse]:
        rows = self._repo.list_for_user(user_id)
        categories: list[CategoryResponse] = []
        for row in rows:
            parsed = self._row_to_response(row)
            if parsed is not None:
                categories.append(parsed)
        return categories

    def create_custom_category(
        self,
        user_id: str,
        body: CreateCategoryRequest,
    ) -> CategoryResponse:
        name = body.name.strip()
        if not name:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Category name is required.",
            )

        if self._repo.count_custom_categories(user_id) >= MAX_CUSTOM_CATEGORIES_PER_USER:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"You can add up to {MAX_CUSTOM_CATEGORIES_PER_USER} custom categories.",
            )

        name_key = name.casefold()
        for row in self._repo.list_for_user(user_id):
            existing = row.get("name")
            if isinstance(existing, str) and existing.strip().casefold() == name_key:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    detail="You already have a category with this name.",
                )

        icon_name = (body.icon_name or DEFAULT_CUSTOM_ICON).strip() or DEFAULT_CUSTOM_ICON
        color = (body.color or DEFAULT_CUSTOM_COLOR).strip() or DEFAULT_CUSTOM_COLOR
        if not self._is_hex_color(color):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Color must be a hex value like #94A3B8.",
            )

        try:
            row = self._repo.insert_custom_category(
                user_id=user_id,
                name=name,
                icon_name=icon_name,
                color=color,
            )
        except Exception as exc:
            logger.exception("categories insert failed")
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail="Could not create category.",
            ) from exc

        parsed = self._row_to_response(row)
        if parsed is None:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail="Could not create category.",
            )
        return parsed

    def update_custom_category(
        self,
        user_id: str,
        category_id: str,
        body: UpdateCategoryRequest,
    ) -> CategoryResponse:
        existing = self._repo.fetch_by_id_for_user(user_id, category_id)
        if existing is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail="Category not found.",
            )
        if existing.get("is_system") is True:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="System categories cannot be edited.",
            )

        name = body.name.strip()
        if not name:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Category name is required.",
            )

        name_key = name.casefold()
        for row in self._repo.list_for_user(user_id):
            row_id = row.get("id")
            if row_id == category_id:
                continue
            existing_name = row.get("name")
            if (
                isinstance(existing_name, str)
                and existing_name.strip().casefold() == name_key
            ):
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    detail="You already have a category with this name.",
                )

        icon_name = (body.icon_name or DEFAULT_CUSTOM_ICON).strip() or DEFAULT_CUSTOM_ICON
        color = (body.color or DEFAULT_CUSTOM_COLOR).strip() or DEFAULT_CUSTOM_COLOR
        if not self._is_hex_color(color):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Color must be a hex value like #94A3B8.",
            )

        row = self._repo.update_custom_category(
            user_id=user_id,
            category_id=category_id,
            name=name,
            icon_name=icon_name,
            color=color,
        )
        if row is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail="Category not found.",
            )
        parsed = self._row_to_response(row)
        if parsed is None:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail="Could not update category.",
            )
        return parsed

    def get_delete_impact(
        self,
        user_id: str,
        category_id: str,
    ) -> CategoryDeleteImpactResponse:
        existing = self._repo.fetch_by_id_for_user(user_id, category_id)
        if existing is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail="Category not found.",
            )
        if existing.get("is_system") is True:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="System categories cannot be deleted.",
            )
        count = self._repo.count_transactions_for_category(
            user_id=user_id,
            category_id=category_id,
        )
        return CategoryDeleteImpactResponse(transaction_count=count)

    def delete_custom_category(
        self,
        user_id: str,
        category_id: str,
        *,
        reassign_to_category_id: str | None = None,
    ) -> None:
        existing = self._repo.fetch_by_id_for_user(user_id, category_id)
        if existing is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail="Category not found.",
            )
        if existing.get("is_system") is True:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="System categories cannot be deleted.",
            )

        tx_count = self._repo.count_transactions_for_category(
            user_id=user_id,
            category_id=category_id,
        )
        if tx_count > 0:
            if not reassign_to_category_id or reassign_to_category_id == category_id:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Choose a category to move transactions to before deleting.",
                )
            target = self._repo.fetch_by_id_for_user(
                user_id,
                reassign_to_category_id,
            )
            if target is None:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Target category not found.",
                )
            target_name = self._coerce_text(target.get("name"))
            if not target_name:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Target category not found.",
                )
            self._repo.reassign_transactions_category(
                user_id=user_id,
                from_category_id=category_id,
                to_category_id=reassign_to_category_id,
                to_category_name=target_name,
            )

        deleted = self._repo.delete_custom_category(
            user_id=user_id,
            category_id=category_id,
        )
        if not deleted:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail="Category not found.",
            )

    @staticmethod
    def _is_hex_color(value: str) -> bool:
        return bool(re.fullmatch(r"#[0-9A-Fa-f]{6}", value))

    @staticmethod
    def _coerce_text(value: object) -> str | None:
        if isinstance(value, str):
            return value
        if value is not None:
            return str(value)
        return None

    @staticmethod
    def _row_to_response(row: dict[str, object]) -> CategoryResponse | None:
        category_id = CategoryService._coerce_text(row.get("id"))
        name = CategoryService._coerce_text(row.get("name"))
        icon_name = CategoryService._coerce_text(row.get("icon_name"))
        color = CategoryService._coerce_text(row.get("color"))
        created_at = CategoryService._coerce_text(row.get("created_at"))
        user_id = CategoryService._coerce_text(row.get("user_id"))
        is_system_raw = row.get("is_system")
        is_system = is_system_raw is True or is_system_raw == "true"
        if not category_id or not name or not icon_name or not color or not created_at:
            return None
        return CategoryResponse(
            id=category_id,
            name=name,
            icon_name=icon_name,
            color=color,
            is_system=is_system,
            created_at=created_at,
            user_id=None if is_system else user_id,
        )
