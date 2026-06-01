"""Daily and monthly budget threshold notifications after debit writes."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from features.budgets.repository import BudgetRepository
from features.notifications.emitter import NotificationEmitter, format_inr
from features.transactions.repository import TransactionRepository
from features.transactions.time_bounds import day_bounds_iso, month_bounds_iso, parse_tz


def _parse_transaction_local_day(
    transaction_at_iso: str,
    timezone: str,
) -> tuple[date, int, int]:
    tz = parse_tz(timezone)
    dt = datetime.fromisoformat(transaction_at_iso.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    else:
        dt = dt.astimezone(tz)
    return dt.date(), dt.year, dt.month


class BudgetThresholdEvaluator:
    def __init__(
        self,
        *,
        budget_repo: BudgetRepository,
        transaction_repo: TransactionRepository,
        emitter: NotificationEmitter,
    ) -> None:
        self._budget_repo = budget_repo
        self._transaction_repo = transaction_repo
        self._emitter = emitter

    def evaluate_after_debit(
        self,
        *,
        user_id: str,
        timezone: str,
        transaction_at_iso: str,
    ) -> None:
        budget_row = self._budget_repo.fetch_by_user_id(user_id)
        if budget_row is None:
            return

        local_day, year, month = _parse_transaction_local_day(
            transaction_at_iso,
            timezone,
        )
        month_key = f"{year}-{month:02d}"
        day_key = local_day.isoformat()

        monthly_cap = Decimal(str(budget_row.get("monthly_budget", 0)))
        if monthly_cap > 0:
            start, end = month_bounds_iso(year, month, timezone)
            spent = self._sum_debits(user_id, start, end)
            self._emit_thresholds(
                user_id=user_id,
                scope="monthly",
                period_key=month_key,
                spent=spent,
                cap=monthly_cap,
                title_80="80% of monthly budget used",
                title_100="Monthly budget exceeded",
                body_80_template="You've spent {spent} of {cap} this month.",
                body_100_template="You're {over} over your {cap} monthly budget.",
            )

        daily_cap = Decimal(str(budget_row.get("daily_budget", 0)))
        if daily_cap > 0:
            start, end = day_bounds_iso(local_day, timezone)
            spent = self._sum_debits(user_id, start, end)
            self._emit_thresholds(
                user_id=user_id,
                scope="daily",
                period_key=day_key,
                spent=spent,
                cap=daily_cap,
                title_80="80% of daily budget used",
                title_100="Daily budget exceeded",
                body_80_template="You've spent {spent} of {cap} today.",
                body_100_template="You're {over} over your {cap} daily budget.",
            )

    def _sum_debits(self, user_id: str, start: str, end: str) -> Decimal:
        blob = self._transaction_repo.fetch_transactions_period_summary(
            user_id,
            from_iso=start,
            to_iso=end,
        )
        if blob is not None:
            return Decimal(str(blob.get("debit_total", "0")))

        rows = self._transaction_repo.iter_amount_type_category(
            user_id,
            from_iso=start,
            to_iso=end,
        )
        spent = Decimal("0")
        for row in rows:
            if row.get("type") == "debit":
                spent += Decimal(str(row.get("amount", "0")))
        return spent

    def _emit_thresholds(
        self,
        *,
        user_id: str,
        scope: Literal["monthly", "daily"],
        period_key: str,
        spent: Decimal,
        cap: Decimal,
        title_80: str,
        title_100: str,
        body_80_template: str,
        body_100_template: str,
    ) -> None:
        pct = spent / cap
        spent_fmt = format_inr(spent)
        cap_fmt = format_inr(cap)

        if pct >= Decimal("0.8"):
            self._emitter.emit_budget_threshold(
                user_id=user_id,
                scope=scope,
                period_key=period_key,
                threshold=80,
                title=title_80,
                body=body_80_template.format(spent=spent_fmt, cap=cap_fmt, over=""),
            )

        if pct > Decimal("1"):
            over = format_inr(spent - cap)
            self._emitter.emit_budget_threshold(
                user_id=user_id,
                scope=scope,
                period_key=period_key,
                threshold=100,
                title=title_100,
                body=body_100_template.format(
                    spent=spent_fmt,
                    cap=cap_fmt,
                    over=over,
                ),
            )
