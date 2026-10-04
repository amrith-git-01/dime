from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from supabase import Client

from features.budgets.repository import BudgetRepository
from features.categories.repository import CategoryRepository
from features.email.html import format_inr
from features.insights.service import (
    _roll_up_counterparty_income,
    _roll_up_counterparty_spend,
)
from features.transactions.repository import TransactionRepository
from features.transactions.service import _to_decimal
from features.transactions.time_bounds import month_bounds_iso, parse_tz

_TOP = 5


@dataclass(frozen=True)
class CategoryDigestRow:
    name: str
    amount: str
    bar_pct: float
    is_custom: bool


@dataclass(frozen=True)
class TopExpenseRow:
    name: str
    date_label: str
    amount: str


@dataclass(frozen=True)
class DigestPayload:
    spent: str
    income: str
    net: str
    payees: tuple[tuple[str, str, float], ...]
    income_sources: tuple[tuple[str, str, float], ...]
    categories: tuple[CategoryDigestRow, ...]
    top_expenses: tuple[TopExpenseRow, ...]
    budget_line: str
    budget_pct: float | None
    empty: bool


def build_digest_payload(
    supabase: Client,
    *,
    user_id: str,
    from_iso: str,
    to_iso: str,
    budget_year: int,
    budget_month: int,
    tz_name: str,
) -> DigestPayload:
    tx_repo = TransactionRepository(supabase)
    blob = tx_repo.fetch_transactions_period_summary(
        user_id, from_iso=from_iso, to_iso=to_iso
    )
    if blob is not None:
        credit = _to_decimal(blob.get("credit_total", "0"))
        debit = _to_decimal(blob.get("debit_total", "0"))
        count = int(blob.get("transaction_count", 0) or 0)
    else:
        rows = tx_repo.iter_amount_type_category(
            user_id, from_iso=from_iso, to_iso=to_iso
        )
        credit = Decimal("0")
        debit = Decimal("0")
        for row in rows:
            amt = _to_decimal(row.get("amount", "0"))
            if row.get("type") == "credit":
                credit += amt
            elif row.get("type") == "debit":
                debit += amt
        count = len(rows)

    net = credit - debit
    empty = count == 0 and debit == 0 and credit == 0

    payees = _ranked_amounts(
        _roll_up_counterparty_spend(
            tx_repo.iter_debit_payee_rows(user_id, from_iso=from_iso, to_iso=to_iso),
            month_debit_total=debit if debit > 0 else Decimal("1"),
        )
        if debit > 0
        else [],
        amount_attr="debit_total",
    )
    income_sources = _ranked_amounts(
        _roll_up_counterparty_income(
            tx_repo.iter_credit_payee_rows(user_id, from_iso=from_iso, to_iso=to_iso),
            month_credit_total=credit,
        )
        if credit > 0
        else [],
        amount_attr="credit_total",
    )
    categories = _category_mix(
        supabase,
        user_id=user_id,
        from_iso=from_iso,
        to_iso=to_iso,
        debit_total=debit,
        tx_repo=tx_repo,
    )
    top_expenses = _top_expenses(
        tx_repo,
        user_id=user_id,
        from_iso=from_iso,
        to_iso=to_iso,
        tz_name=tz_name,
    )
    budget_line, budget_pct = _budget_remaining(
        supabase,
        user_id=user_id,
        year=budget_year,
        month=budget_month,
        tz_name=tz_name,
    )
    return DigestPayload(
        spent=format(debit, "f"),
        income=format(credit, "f"),
        net=format(net, "f"),
        payees=payees,
        income_sources=income_sources,
        categories=categories,
        top_expenses=top_expenses,
        budget_line=budget_line,
        budget_pct=budget_pct,
        empty=empty,
    )


def _ranked_amounts(models: list[Any], *, amount_attr: str) -> tuple[tuple[str, str, float], ...]:
    top = models[:_TOP]
    amounts = [_to_decimal(getattr(row, amount_attr)) for row in top]
    max_amt = max(amounts, default=Decimal("1"))
    return tuple(
        (
            row.display_name,
            getattr(row, amount_attr),
            float(amt / max_amt) if max_amt > 0 else 0.0,
        )
        for row, amt in zip(top, amounts, strict=True)
    )


def _is_system_category(meta: dict[str, Any]) -> bool:
    raw = meta.get("is_system")
    return raw is True or raw == "true"


def _category_mix(
    supabase: Client,
    *,
    user_id: str,
    from_iso: str,
    to_iso: str,
    debit_total: Decimal,
    tx_repo: TransactionRepository,
) -> tuple[CategoryDigestRow, ...]:
    if debit_total <= 0:
        return ()
    rows = tx_repo.iter_amount_type_category(
        user_id, from_iso=from_iso, to_iso=to_iso
    )
    buckets: dict[str, Decimal] = {}
    for row in rows:
        if row.get("type") != "debit":
            continue
        cat_id = row.get("category_id")
        key = cat_id if isinstance(cat_id, str) and cat_id else "__none__"
        buckets[key] = buckets.get(key, Decimal("0")) + _to_decimal(row.get("amount", "0"))
    ids = {key for key in buckets if key != "__none__"}
    meta = CategoryRepository.fetch_meta_by_ids(supabase, ids, user_id=user_id)
    ranked = sorted(buckets.items(), key=lambda item: item[1], reverse=True)
    max_amt = ranked[0][1] if ranked else Decimal("1")
    out: list[CategoryDigestRow] = []
    for key, amt in ranked:
        if key == "__none__":
            name = "Uncategorized"
            is_custom = False
        else:
            row_meta = meta.get(key, {})
            raw = row_meta.get("name")
            name = raw if isinstance(raw, str) and raw.strip() else "Category"
            is_custom = not _is_system_category(row_meta)
        out.append(
            CategoryDigestRow(
                name=name,
                amount=format(amt, "f"),
                bar_pct=float(amt / max_amt) if max_amt > 0 else 0.0,
                is_custom=is_custom,
            )
        )
    return tuple(out)


def _local_date(raw_at: object, *, tz_name: str) -> date | None:
    if not isinstance(raw_at, str) or not raw_at.strip():
        return None
    try:
        tx_dt = datetime.fromisoformat(raw_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    tz = parse_tz(tz_name)
    if tx_dt.tzinfo is None:
        tx_dt = tx_dt.replace(tzinfo=tz)
    return tx_dt.astimezone(tz).date()


def _top_expenses(
    tx_repo: TransactionRepository,
    *,
    user_id: str,
    from_iso: str,
    to_iso: str,
    tz_name: str,
) -> tuple[TopExpenseRow, ...]:
    rows = tx_repo.list_top_debit_transactions(
        user_id, from_iso=from_iso, to_iso=to_iso, limit=_TOP
    )
    out: list[TopExpenseRow] = []
    for row in rows:
        raw_name = row.get("counterparty_name")
        name = raw_name.strip() if isinstance(raw_name, str) and raw_name.strip() else "Expense"
        day = _local_date(row.get("transaction_at"), tz_name=tz_name)
        date_label = f"{day.day} {day.strftime('%b')}" if day is not None else ""
        out.append(
            TopExpenseRow(
                name=name,
                date_label=date_label,
                amount=format(_to_decimal(row.get("amount", "0")), "f"),
            )
        )
    return tuple(out)


def _budget_remaining(
    supabase: Client,
    *,
    user_id: str,
    year: int,
    month: int,
    tz_name: str,
) -> tuple[str, float | None]:
    budget_row = BudgetRepository(supabase).fetch_by_user_id(user_id)
    monthly = _to_decimal((budget_row or {}).get("monthly_budget", "0"))
    if monthly <= 0:
        return "No budget set", None
    start, end = month_bounds_iso(year, month, tz_name)
    blob = TransactionRepository(supabase).fetch_transactions_period_summary(
        user_id, from_iso=start, to_iso=end
    )
    if blob is not None:
        spent = _to_decimal(blob.get("debit_total", "0"))
    else:
        spent = Decimal("0")
        for row in TransactionRepository(supabase).iter_amount_type_category(
            user_id, from_iso=start, to_iso=end
        ):
            if row.get("type") == "debit":
                spent += _to_decimal(row.get("amount", "0"))
    remaining = monthly - spent
    used = float(spent / monthly) if monthly > 0 else 0.0
    line = f"{format_inr(format(remaining, 'f'))} / {format_inr(format(monthly, 'f'))}"
    return line, used
