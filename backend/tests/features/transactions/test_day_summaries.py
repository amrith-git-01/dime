"""Tests for transaction list day summaries."""

from __future__ import annotations

from features.transactions.service import _build_day_summaries


def test_build_day_summaries_groups_credit_debit_and_net() -> None:
    rows = [
        {
            "amount": "100.00",
            "type": "credit",
            "transaction_at": "2026-05-21T09:00:00+05:30",
        },
        {
            "amount": "235.00",
            "type": "debit",
            "transaction_at": "2026-05-21T13:04:00+05:30",
        },
        {
            "amount": "50.00",
            "type": "debit",
            "transaction_at": "2026-05-22T10:00:00+05:30",
        },
    ]

    summaries = _build_day_summaries(rows, tz_name="Asia/Kolkata")

    assert set(summaries) == {"2026-05-21", "2026-05-22"}

    may_21 = summaries["2026-05-21"]
    assert may_21.credit_total == "100.00"
    assert may_21.debit_total == "235.00"
    assert may_21.net == "-135.00"
    assert may_21.transaction_count == 2

    may_22 = summaries["2026-05-22"]
    assert may_22.debit_total == "50.00"
    assert may_22.credit_total == "0.00"
    assert may_22.net == "-50.00"
    assert may_22.transaction_count == 1


def test_build_day_summaries_empty_input() -> None:
    assert _build_day_summaries([], tz_name="Asia/Kolkata") == {}
