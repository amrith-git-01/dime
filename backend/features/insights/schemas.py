"""Pydantic models for month insights API."""

from __future__ import annotations

from pydantic import BaseModel, Field

from features.transactions.schemas import TransactionResponse


class InsightsSummary(BaseModel):
    credit_total: str
    debit_total: str
    net: str
    transaction_count: int


class DailyCashflowRow(BaseModel):
    date: str
    debit_total: str
    credit_total: str


class CounterpartySpendRow(BaseModel):
    payee_key: str
    display_name: str
    debit_total: str
    share: float = Field(ge=0, le=1)
    transaction_count: int = Field(ge=0)


class MonthInsightsResponse(BaseModel):
    year: int
    month: int
    summary: InsightsSummary
    daily_cashflow: list[DailyCashflowRow]
    counterparty_spend: list[CounterpartySpendRow]
    top_expenses: list[TransactionResponse]
