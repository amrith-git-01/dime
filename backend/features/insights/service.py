"""Build month-scoped insights payload from transaction aggregates."""

from __future__ import annotations

import calendar
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from supabase import Client

from core.security import CurrentUser
from features.insights.schemas import (
    CounterpartyIncomeRow,
    CounterpartySpendRow,
    DailyCashflowRow,
    InsightsSummary,
    MonthInsightsResponse,
    MonthlyCashflowRow,
    YearInsightsResponse,
)
from features.transactions.repository import TransactionRepository
from features.transactions.schemas import TransactionResponse
from features.transactions.service import TransactionService, _to_decimal
from features.transactions.time_bounds import month_range_iso, parse_tz

_TOP_PAYEES = 4
_TOP_EXPENSES = 5
_TOP_INCOME_SOURCES = 5


def _normalize_payee_key(raw: str) -> str:
    lowered = raw.strip().lower()
    lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
    normalized = re.sub(r"\s+", " ", lowered).strip()
    return normalized or "unknown"


def _payee_key_from_row(row: dict[str, Any]) -> str:
    norm = row.get("counterparty_normalized")
    if isinstance(norm, str) and norm.strip():
        return norm.strip()
    name = row.get("counterparty_name")
    if isinstance(name, str) and name.strip():
        return _normalize_payee_key(name)
    return "unknown"


def _parse_tx_day(raw_at: object, *, tz_name: str, year: int, month: int) -> str | None:
    if not isinstance(raw_at, str) or not raw_at.strip():
        return None
    try:
        tx_dt = datetime.fromisoformat(raw_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    tz = parse_tz(tz_name)
    if tx_dt.tzinfo is None:
        tx_dt = tx_dt.replace(tzinfo=tz)
    local = tx_dt.astimezone(tz).date()
    if local.year != year or local.month != month:
        return None
    return local.isoformat()


def _build_daily_cashflow(
    rows: list[dict[str, Any]],
    *,
    year: int,
    month: int,
    tz_name: str,
) -> list[DailyCashflowRow]:
    days_in_month = calendar.monthrange(year, month)[1]
    debit_totals: dict[str, Decimal] = {}
    credit_totals: dict[str, Decimal] = {}

    for row in rows:
        day_key = _parse_tx_day(row.get("transaction_at"), tz_name=tz_name, year=year, month=month)
        if day_key is None:
            continue
        amt = _to_decimal(row.get("amount", "0"))
        if row.get("type") == "debit":
            debit_totals[day_key] = debit_totals.get(day_key, Decimal("0")) + amt
        elif row.get("type") == "credit":
            credit_totals[day_key] = credit_totals.get(day_key, Decimal("0")) + amt

    result: list[DailyCashflowRow] = []
    for day_num in range(1, days_in_month + 1):
        key = date(year, month, day_num).isoformat()
        result.append(
            DailyCashflowRow(
                date=key,
                debit_total=format(debit_totals.get(key, Decimal("0")), "f"),
                credit_total=format(credit_totals.get(key, Decimal("0")), "f"),
            )
        )
    return result


def _build_monthly_cashflow(
    rows: list[dict[str, Any]],
    *,
    year: int,
    tz_name: str,
    end_month: int,
) -> list[MonthlyCashflowRow]:
    """Bucket daily transaction rows into per-month totals for a calendar year."""
    tz = parse_tz(tz_name)
    debit_by_month: dict[int, Decimal] = {}
    credit_by_month: dict[int, Decimal] = {}

    for row in rows:
        raw_at = row.get("transaction_at")
        if not isinstance(raw_at, str) or not raw_at.strip():
            continue
        try:
            tx_dt = datetime.fromisoformat(raw_at.replace("Z", "+00:00"))
        except ValueError:
            continue
        if tx_dt.tzinfo is None:
            tx_dt = tx_dt.replace(tzinfo=tz)
        local = tx_dt.astimezone(tz).date()
        if local.year != year:
            continue
        m = local.month
        amt = _to_decimal(row.get("amount", "0"))
        if row.get("type") == "debit":
            debit_by_month[m] = debit_by_month.get(m, Decimal("0")) + amt
        elif row.get("type") == "credit":
            credit_by_month[m] = credit_by_month.get(m, Decimal("0")) + amt

    return [
        MonthlyCashflowRow(
            month=m,
            date=f"{year}-{m:02d}-01",
            debit_total=format(debit_by_month.get(m, Decimal("0")), "f"),
            credit_total=format(credit_by_month.get(m, Decimal("0")), "f"),
        )
        for m in range(1, end_month + 1)
    ]


def _roll_up_counterparty_spend(
    rows: list[dict[str, Any]],
    *,
    month_debit_total: Decimal,
) -> list[CounterpartySpendRow]:
    if month_debit_total <= 0:
        return []

    buckets: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = _payee_key_from_row(row)
        amt = _to_decimal(row.get("amount", "0"))
        bucket = buckets.setdefault(
            key,
            {"total": Decimal("0"), "display": "Unknown", "count": 0},
        )
        bucket["total"] += amt
        bucket["count"] += 1
        name = row.get("counterparty_name")
        if isinstance(name, str) and name.strip():
            bucket["display"] = name.strip()

    ranked = sorted(buckets.items(), key=lambda item: item[1]["total"], reverse=True)
    top = ranked[:_TOP_PAYEES]
    other_total = sum(item[1]["total"] for item in ranked[_TOP_PAYEES:])
    other_count = sum(item[1]["count"] for item in ranked[_TOP_PAYEES:])

    result: list[CounterpartySpendRow] = []
    for key, data in top:
        total: Decimal = data["total"]
        result.append(
            CounterpartySpendRow(
                payee_key=key,
                display_name=str(data["display"]),
                debit_total=format(total, "f"),
                share=float((total / month_debit_total).quantize(Decimal("0.0001"))),
                transaction_count=int(data["count"]),
            )
        )

    if other_total > 0:
        result.append(
            CounterpartySpendRow(
                payee_key="__other__",
                display_name="Other",
                debit_total=format(other_total, "f"),
                share=float((other_total / month_debit_total).quantize(Decimal("0.0001"))),
                transaction_count=other_count,
            )
        )
    return result


def _roll_up_counterparty_income(
    rows: list[dict[str, Any]],
    *,
    month_credit_total: Decimal,
) -> list[CounterpartyIncomeRow]:
    """Aggregate credit rows by payee, returning top income sources by amount."""
    if month_credit_total <= 0:
        return []

    buckets: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = _payee_key_from_row(row)
        amt = _to_decimal(row.get("amount", "0"))
        bucket = buckets.setdefault(
            key,
            {"total": Decimal("0"), "display": "Unknown", "count": 0},
        )
        bucket["total"] += amt
        bucket["count"] += 1
        name = row.get("counterparty_name")
        if isinstance(name, str) and name.strip():
            bucket["display"] = name.strip()

    ranked = sorted(buckets.items(), key=lambda item: item[1]["total"], reverse=True)
    top = ranked[:_TOP_INCOME_SOURCES]

    result: list[CounterpartyIncomeRow] = []
    for key, data in top:
        total: Decimal = data["total"]
        result.append(
            CounterpartyIncomeRow(
                payee_key=key,
                display_name=str(data["display"]),
                credit_total=format(total, "f"),
                share=float((total / month_credit_total).quantize(Decimal("0.0001"))),
                transaction_count=int(data["count"]),
            )
        )
    return result


class InsightsService:
    def __init__(self, supabase: Client) -> None:
        self._repo = TransactionRepository(supabase)
        self._tx_service = TransactionService(supabase)

    def month_insights(
        self,
        user: CurrentUser,
        *,
        year: int,
        month: int,
        timezone: str,
    ) -> MonthInsightsResponse:
        start, end = month_range_iso(year, month, timezone)
        blob = self._repo.fetch_transactions_period_summary(
            user.id,
            from_iso=start,
            to_iso=end,
        )

        if blob is not None:
            credit_total = _to_decimal(blob.get("credit_total", "0"))
            debit_total = _to_decimal(blob.get("debit_total", "0"))
            transaction_count = int(blob.get("transaction_count", 0))
        else:
            amount_rows = self._repo.iter_amount_type_category(
                user.id,
                from_iso=start,
                to_iso=end,
            )
            credit_total = Decimal("0")
            debit_total = Decimal("0")
            for row in amount_rows:
                amt = _to_decimal(row.get("amount", "0"))
                if row.get("type") == "credit":
                    credit_total += amt
                elif row.get("type") == "debit":
                    debit_total += amt
            transaction_count = len(amount_rows)

        net = credit_total - debit_total
        summary = InsightsSummary(
            credit_total=format(credit_total, "f"),
            debit_total=format(debit_total, "f"),
            net=format(net, "f"),
            transaction_count=transaction_count,
        )

        daily_rows = self._repo.iter_amount_type_at(
            user.id,
            from_iso=start,
            to_iso=end,
        )
        daily_cashflow = _build_daily_cashflow(
            daily_rows,
            year=year,
            month=month,
            tz_name=timezone,
        )

        payee_rows = self._repo.iter_debit_payee_rows(
            user.id,
            from_iso=start,
            to_iso=end,
        )
        counterparty_spend = _roll_up_counterparty_spend(
            payee_rows,
            month_debit_total=debit_total,
        )

        income_rows = self._repo.iter_credit_payee_rows(
            user.id,
            from_iso=start,
            to_iso=end,
        )
        counterparty_income = _roll_up_counterparty_income(
            income_rows,
            month_credit_total=credit_total,
        )

        top_raw = self._repo.list_top_debit_transactions(
            user.id,
            from_iso=start,
            to_iso=end,
            limit=_TOP_EXPENSES,
        )
        enriched = self._tx_service.enrich_rows(user.id, top_raw)
        top_expenses = [TransactionResponse.model_validate(row) for row in enriched]

        return MonthInsightsResponse(
            year=year,
            month=month,
            summary=summary,
            daily_cashflow=daily_cashflow,
            counterparty_spend=counterparty_spend,
            counterparty_income=counterparty_income,
            top_expenses=top_expenses,
        )

    def year_insights(
        self,
        user: CurrentUser,
        *,
        from_iso: str,
        to_iso: str,
        timezone: str,
    ) -> YearInsightsResponse:
        """Aggregate insights for a full year or YTD window in 3 DB round-trips.

        Uses the same underlying repository methods as month_insights but over
        the full year range, then buckets daily rows into monthly cashflow in
        Python — no per-month parallel fetches required.
        """
        from_date = date.fromisoformat(from_iso[:10])
        to_date = date.fromisoformat(to_iso[:10])
        year = from_date.year
        is_ytd = not (to_date.month == 12 and to_date.day == 31)

        # Query 1: summary totals via fast RPC
        blob = self._repo.fetch_transactions_period_summary(
            user.id, from_iso=from_iso, to_iso=to_iso
        )
        if blob is not None:
            credit_total = _to_decimal(blob.get("credit_total", "0"))
            debit_total = _to_decimal(blob.get("debit_total", "0"))
            transaction_count = int(blob.get("transaction_count", 0))
        else:
            amount_rows = self._repo.iter_amount_type_category(
                user.id, from_iso=from_iso, to_iso=to_iso
            )
            credit_total = Decimal("0")
            debit_total = Decimal("0")
            for row in amount_rows:
                amt = _to_decimal(row.get("amount", "0"))
                if row.get("type") == "credit":
                    credit_total += amt
                elif row.get("type") == "debit":
                    debit_total += amt
            transaction_count = len(amount_rows)

        net = credit_total - debit_total
        summary = InsightsSummary(
            credit_total=format(credit_total, "f"),
            debit_total=format(debit_total, "f"),
            net=format(net, "f"),
            transaction_count=transaction_count,
        )

        # Query 2: daily rows bucketed into monthly cashflow
        daily_rows = self._repo.iter_amount_type_at(
            user.id, from_iso=from_iso, to_iso=to_iso
        )
        monthly_cashflow = _build_monthly_cashflow(
            daily_rows,
            year=year,
            tz_name=timezone,
            end_month=to_date.month,
        )

        # Query 3: top payees for the whole year
        payee_rows = self._repo.iter_debit_payee_rows(
            user.id, from_iso=from_iso, to_iso=to_iso
        )
        top_payees = _roll_up_counterparty_spend(payee_rows, month_debit_total=debit_total)

        return YearInsightsResponse(
            year=year,
            is_ytd=is_ytd,
            summary=summary,
            monthly_cashflow=monthly_cashflow,
            top_payees=top_payees,
        )
