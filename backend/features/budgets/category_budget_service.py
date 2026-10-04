"""Per-category monthly budget caps."""

from __future__ import annotations

import logging

from fastapi import HTTPException, status
from supabase import Client

from features.budgets.category_budget_repository import CategoryBudgetRepository
from features.budgets.category_budget_schemas import (
    CategoryBudgetItem,
    CategoryBudgetListResponse,
    CategoryBudgetUpsertBody,
)
from features.categories.repository import CategoryRepository

logger = logging.getLogger(__name__)


class CategoryBudgetService:
    def __init__(self, supabase: Client) -> None:
        self._repo = CategoryBudgetRepository(supabase)
        self._db = supabase

    def _require_visible_category(self, user_id: str, category_id: str) -> None:
        if not CategoryRepository.category_visible_to_user(
            self._db,
            user_id=user_id,
            category_id=category_id,
        ):
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail="Category not found.",
            )

    def list_category_budgets(self, user_id: str) -> CategoryBudgetListResponse:
        rows = self._repo.list_for_user(user_id)
        items: list[CategoryBudgetItem] = []
        for row in rows:
            cat_id = row.get("category_id")
            amount = row.get("monthly_amount")
            if isinstance(cat_id, str) and amount is not None:
                items.append(
                    CategoryBudgetItem(
                        category_id=cat_id,
                        monthly_amount=str(amount),
                    ),
                )
        return CategoryBudgetListResponse(items=items)

    def upsert_category_budget(
        self,
        user_id: str,
        category_id: str,
        body: CategoryBudgetUpsertBody,
    ) -> CategoryBudgetItem:
        self._require_visible_category(user_id, category_id)
        try:
            row = self._repo.upsert(
                user_id=user_id,
                category_id=category_id,
                monthly_amount=body.monthly_amount,
            )
        except Exception as exc:
            logger.exception("category_budget upsert failed")
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail="Could not save category budget.",
            ) from exc
        return CategoryBudgetItem(
            category_id=category_id,
            monthly_amount=str(row.get("monthly_amount", body.monthly_amount)),
        )

    def delete_category_budget(self, user_id: str, category_id: str) -> None:
        self._require_visible_category(user_id, category_id)
        try:
            self._repo.delete(user_id=user_id, category_id=category_id)
        except Exception as exc:
            logger.exception("category_budget delete failed")
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail="Could not remove category budget.",
            ) from exc
