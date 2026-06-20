"""Pydantic models for transaction API."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import AliasChoices, BaseModel, Field, field_validator

TransactionType = Literal["debit", "credit"]
DetectedViaType = Literal["manual", "sms", "voice", "scan", "notification"]
CounterpartyType = Literal["merchant", "person", "self_transfer", "unknown"]


class TransactionCreate(BaseModel):
    amount: Decimal = Field(..., gt=0)
    type: TransactionType
    counterparty_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        validation_alias=AliasChoices("counterparty_name", "merchant"),
    )
    counterparty_type: CounterpartyType | None = None
    category: str | None = Field(default=None, max_length=120)
    category_id: UUID | None = None
    note: str | None = Field(default=None, max_length=2000)
    transaction_at: datetime
    detected_via: DetectedViaType | None = None
    receipt_url: str | None = Field(default=None, max_length=2048)
    voice_url: str | None = Field(default=None, max_length=2048)

    @field_validator("counterparty_type", mode="before")
    @classmethod
    def normalize_create_counterparty_type(cls, value: object) -> str | None:
        allowed: frozenset[str] = frozenset({"merchant", "person", "self_transfer", "unknown"})
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped in allowed else None
        return None

    @field_validator("amount")
    @classmethod
    def quantize_amount(cls, value: Decimal) -> Decimal:
        return value.quantize(Decimal("0.01"))

    @field_validator("counterparty_name")
    @classmethod
    def strip_counterparty_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("category", "note", mode="before")
    @classmethod
    def empty_to_none(cls, value: object) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return None

    @field_validator("detected_via", mode="before")
    @classmethod
    def normalize_detected_via(cls, value: object) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            if stripped == "upi":
                return "notification"
            return stripped
        return None


class TransactionResponse(BaseModel):
    id: str
    user_id: str
    amount: str
    type: TransactionType
    counterparty_name: str | None
    counterparty_type: CounterpartyType
    counterparty_normalized: str | None
    merchant: str
    category: str | None
    category_id: str | None = None
    category_icon_name: str | None = None
    category_color: str | None = None
    note: str | None
    detected_via: DetectedViaType | None
    transaction_at: datetime
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    receipt_url: str | None = None
    voice_url: str | None = None
    payment_hash: str | None = None

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

    @field_validator("detected_via", mode="before")
    @classmethod
    def normalize_response_detected_via(cls, value: object) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            if stripped == "upi":
                return "notification"
            return stripped
        return None

    @field_validator("counterparty_type", mode="before")
    @classmethod
    def normalize_counterparty_type(cls, value: object) -> str:
        allowed: frozenset[str] = frozenset({"merchant", "person", "self_transfer", "unknown"})
        if value is None or (isinstance(value, str) and not value.strip()):
            return "merchant"
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped in allowed else "merchant"
        return "merchant"


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    has_more: bool


class MonthSummaryResponse(BaseModel):
    credit_total: str
    debit_total: str
    net: str
    transaction_count: int
    """Debit totals keyed by category id; ``__uncategorized__`` when category is null."""
    debit_by_category: dict[str, str] = {}


class TopCategoryRow(BaseModel):
    category_id: str | None
    name: str
    icon_name: str | None = None
    color: str | None = None
    total: str


class DailySpendRow(BaseModel):
    """Debit total for one calendar day (YYYY-MM-DD in the user's timezone)."""

    date: str
    total: str


class HomeOverviewResponse(BaseModel):
    spent_today: str
    spent_this_month: str
    top_categories: list[TopCategoryRow]
    recent_transactions: list[TransactionResponse]
    last_7_days_spend: list[DailySpendRow]
