from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, Field

class ParseMode(str, Enum):
    sms = "sms"
    receipt = "receipt"
    voice = "voice"

class CounterpartyType(str, Enum):
    merchant = "merchant"
    person = "person"
    self_transfer = "self_transfer"
    unknown = "unknown"

class ExpenseType(str, Enum):
    debit = "debit"
    credit = "credit"

class ParseExpenseTextRequest(BaseModel):
    mode: ParseMode
    text: str = Field(min_length=1, max_length=8000)
    timezone: str | None = None
    locale: str | None = None
    source_app: str | None = None

class ParseExpenseResult(BaseModel):
    counterparty_name: str = Field(min_length=1, max_length=120)
    counterparty_type: CounterpartyType
    amount: Decimal = Field(gt=0)
    type: ExpenseType
    date: datetime | None = None
    category: str = Field(min_length=1, max_length=64)
    note: str | None = Field(default=None, max_length=2000)
    confidence: float = Field(ge=0, le=1)
    raw_model: str = Field(min_length=1)


class ParseExpenseResponse(BaseModel):
    mode: ParseMode
    result: ParseExpenseResult