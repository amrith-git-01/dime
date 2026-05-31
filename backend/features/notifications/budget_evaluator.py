"""Monthly budget threshold notifications after debit writes."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from features.budgets.repository import BudgetRepository
from features.notifications.emitter import NotificationEmitter, format_inr
from features.transactions.repository import TransactionRepository
from features.transactions.time_bounds import month_bounds_iso, parse_tz


def _month_key_from_iso(transaction_at_iso: str, timezone: str) -> tuple[str, int, int]:
    tz = parse_tz(timezone)
    dt = datetime.fromisoformat(transaction_at_iso.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    else:
        dt = dt.astimezone(tz)
    return f"{dt.year}-{dt.month:02d}", dt.year, dt.month


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

        monthly_raw = budget_row.get("monthly_budget", 0)
        budget = Decimal(str(monthly_raw))
        if budget <= 0:
            return

        month_key, year, month = _month_key_from_iso(transaction_at_iso, timezone)
        start, end = month_bounds_iso(year, month, timezone)

        blob = self._transaction_repo.fetch_transactions_period_summary(
            user_id,
            from_iso=start,
            to_iso=end,
        )
        if blob is not None:
            spent = Decimal(str(blob.get("debit_total", "0")))
        else:
            rows = self._transaction_repo.iter_amount_type_category(
                user_id,
                from_iso=start,
                to_iso=end,
            )
            spent = Decimal("0")
            for row in rows:
                if row.get("type") == "debit":
                    spent += Decimal(str(row.get("amount", "0")))

        pct = spent / budget
        spent_fmt = format_inr(spent)
        budget_fmt = format_inr(budget)

        if pct >= Decimal("0.8"):
            self._emitter.emit_budget_threshold(
                user_id=user_id,
                threshold=80,
                month_key=month_key,
                title="80% of monthly budget used",
                body=f"You've spent {spent_fmt} of {budget_fmt} this month.",
            )

        if pct > Decimal("1"):
            over = spent - budget
            self._emitter.emit_budget_threshold(
                user_id=user_id,
                threshold=100,
                month_key=month_key,
                title="Monthly budget exceeded",
                body=f"You're {format_inr(over)} over your {budget_fmt} budget.",
            )
