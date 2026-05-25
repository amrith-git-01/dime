from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field


class BudgetUpsertBody(BaseModel):
    """Monthly budget amount (INR or user currency; stored as numeric)."""

    amount: Annotated[Decimal, Field(ge=0, description="Non-negative monthly cap.")]


class BudgetResponse(BaseModel):
    id: str
    user_id: str
    monthly_budget: Decimal
    daily_budget: Decimal
    created_at: datetime
    updated_at: datetime


class BudgetGetResponse(BaseModel):
    """``budget`` is ``null`` when the user has not set one yet."""

    budget: BudgetResponse | None = None
