"""Cloud receipt parse schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

TransactionType = Literal["debit", "credit"]


class ReceiptParseResponse(BaseModel):
    merchant: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., gt=0)
    type: TransactionType = "debit"
    category: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=2000)
    transaction_at: datetime

