from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, model_validator


class BudgetUpsertBody(BaseModel):
    """Partial update: set daily and/or monthly caps independently."""

    monthly_amount: Annotated[
        Decimal | None,
        Field(default=None, ge=0, description="Non-negative monthly cap."),
    ] = None
    daily_amount: Annotated[
        Decimal | None,
        Field(default=None, ge=0, description="Non-negative daily cap."),
    ] = None

    @model_validator(mode="after")
    def require_at_least_one_amount(self) -> BudgetUpsertBody:
        if self.monthly_amount is None and self.daily_amount is None:
            msg = "At least one of monthly_amount or daily_amount is required."
            raise ValueError(msg)
        return self


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
