from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

CounterpartyType = Literal["merchant", "person", "self_transfer", "unknown"]


class ParseMode(str, Enum):
    receipt = "receipt"
    voice = "voice"

class ExpenseType(str, Enum):
    debit = "debit"
    credit = "credit"

class ParseExpenseResult(BaseModel):
    counterparty_name: str = Field(min_length=1, max_length=120)
    counterparty_type: CounterpartyType
    amount: Decimal = Field(gt=0)
    type: ExpenseType
    date: datetime | None = None
    category: str = Field(min_length=1, max_length=64)
    category_id: str | None = None
    note: str | None = Field(default=None, max_length=2000)
    confidence: float = Field(ge=0, le=1)
    raw_model: str = Field(min_length=1)