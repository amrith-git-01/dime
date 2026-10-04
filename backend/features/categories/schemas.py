from decimal import Decimal
from typing import Self

from pydantic import BaseModel, Field, model_validator


class CategoryResponse(BaseModel):
    id: str
    name: str
    icon_name: str
    color: str
    is_system: bool
    created_at: str
    user_id: str | None = None
    # Populated by PATCH only (the category's monthly budget after the update); None elsewhere.
    budget_amount: str | None = None


class CreateCategoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    icon_name: str | None = Field(default=None, max_length=64)
    color: str | None = Field(default=None, max_length=16)


class UpdateCategoryRequest(BaseModel):
    """Partial update: an absent field is left unchanged.

    ``budget_amount`` has three states (use ``model_fields_set`` to tell them apart):
    absent = leave the category budget alone, ``null`` = remove it, number/decimal string
    ``>= 0`` = upsert it.
    """

    name: str | None = Field(default=None, min_length=1, max_length=40)
    icon_name: str | None = Field(default=None, max_length=64)
    color: str | None = Field(default=None, max_length=16)
    budget_amount: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=12,
        decimal_places=2,
        allow_inf_nan=False,
    )

    @property
    def has_budget_change(self) -> bool:
        return "budget_amount" in self.model_fields_set

    @model_validator(mode="after")
    def require_something_to_update(self) -> Self:
        if (
            self.name is None
            and self.icon_name is None
            and self.color is None
            and not self.has_budget_change
        ):
            raise ValueError("Nothing to update.")
        return self


class CategoryDeleteImpactResponse(BaseModel):
    transaction_count: int = Field(ge=0)
