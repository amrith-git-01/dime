from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, Field


class CategoryBudgetItem(BaseModel):
    category_id: str
    monthly_amount: str


class CategoryBudgetListResponse(BaseModel):
    items: list[CategoryBudgetItem]


class CategoryBudgetUpsertBody(BaseModel):
    monthly_amount: Decimal = Field(gt=0)
