"""Pydantic models for transaction API."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator

TransactionType = Literal["debit", "credit"]


class TransactionCreate(BaseModel):
    amount: Decimal = Field(..., gt=0)
    type: TransactionType
    merchant: str = Field(..., min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=2000)
    transaction_at: datetime
    detected_via: str | None = Field(default=None, max_length=64)

    @field_validator("amount")
    @classmethod
    def quantize_amount(cls, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"))

    @field_validator("merchant")
    @classmethod
    def strip_merchant(cls, value: str) -> str:
        return value.strip()

    @field_validator("category", "note", "detected_via", mode="before")
    @classmethod
    def empty_to_none(cls, value: object) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return None


class TransactionResponse(BaseModel):
    id: str
    user_id: str
    amount: str
    type: TransactionType
    merchant: str
    category: str | None
    note: str | None
    detected_via: str | None
    transaction_at: datetime
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    @field_validator("amount", mode="before")
    @classmethod
    def amount_to_str(cls, value: object) -> str:
        if isinstance(value, str):
            return value
        if isinstance(value, Decimal):
            return format(value, "f")
        if isinstance(value, float | int):
            return format(Decimal(str(value)), "f")
        return str(value)
