from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from core.security import CurrentUser
from features.insights.service import (
    InsightsService,
    _build_daily_cashflow,
    _roll_up_counterparty_spend,
)
from features.transactions.service import _to_decimal

_USER = CurrentUser(id="user-1", email="a@b.com")


@pytest.fixture
def service() -> InsightsService:
    return InsightsService(supabase=MagicMock())


def test_build_daily_cashflow_fills_zero_days() -> None:
    rows = [
        {
            "type": "debit",
            "amount": "100.00",
            "transaction_at": "2026-05-15T10:00:00+05:30",
        },
        {
            "type": "credit",
            "amount": "50.00",
            "transaction_at": "2026-05-15T12:00:00+05:30",
        },
    ]
    result = _build_daily_cashflow(
        rows,
        year=2026,
        month=5,
        tz_name="Asia/Kolkata",
    )
    assert len(result) == 31
    mid = next(r for r in result if r.date == "2026-05-15")
    assert mid.debit_total == "100.00"
    assert mid.credit_total == "50.00"
    empty = next(r for r in result if r.date == "2026-05-01")
    assert empty.debit_total == "0"
    assert empty.credit_total == "0"


def test_roll_up_counterparty_top_four_plus_other() -> None:
    rows = []
    for i in range(8):
        rows.append(
            {
                "counterparty_normalized": f"payee-{i}",
                "counterparty_name": f"Payee {i}",
                "amount": str(100 - i),
            }
        )
    month_debit = sum(_to_decimal(r["amount"]) for r in rows)
    result = _roll_up_counterparty_spend(rows, month_debit_total=month_debit)
    assert len(result) == 5
    assert result[0].transaction_count == 1
    assert result[-1].display_name == "Other"
    assert result[-1].payee_key == "__other__"
    assert result[-1].transaction_count == 4
    shares = sum(r.share for r in result)
    assert 0.99 <= shares <= 1.01


def test_month_insights_uses_rpc_summary(service: InsightsService) -> None:
    service._repo.fetch_transactions_period_summary = MagicMock(
        return_value={
            "credit_total": "200.00",
            "debit_total": "150.00",
            "transaction_count": 3,
        }
    )
    service._repo.iter_amount_type_at = MagicMock(return_value=[])
    service._repo.iter_debit_payee_rows = MagicMock(return_value=[])
    service._repo.list_top_debit_transactions = MagicMock(return_value=[])
    service._tx_service.enrich_rows = MagicMock(return_value=[])

    payload = service.month_insights(
        _USER,
        year=2026,
        month=5,
        timezone="Asia/Kolkata",
    )

    assert payload.summary.debit_total == "150.00"
    assert payload.summary.credit_total == "200.00"
    assert payload.summary.net == "50.00"
    assert payload.summary.transaction_count == 3
    assert len(payload.daily_cashflow) == 31
