"""Daily and monthly budget threshold notifications after debit writes."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from features.budgets.category_budget_repository import CategoryBudgetRepository
from features.budgets.repository import BudgetRepository
from features.categories.repository import CategoryRepository
from features.notifications.emitter import NotificationEmitter, format_inr
from features.transactions.repository import TransactionRepository
from features.transactions.time_bounds import day_bounds_iso, month_bounds_iso, parse_tz


def _debit_by_category_from_period_blob(blob: dict[str, object]) -> dict[str, Decimal]:
    debit_by_category: dict[str, Decimal] = {}
    raw_cats = blob.get("debit_by_category")
    if not isinstance(raw_cats, dict):
        return debit_by_category
    for cid_key, total in raw_cats.items():
        if not isinstance(cid_key, str) or cid_key == "":
            continue
        debit_by_category[cid_key] = Decimal(str(total))
    return debit_by_category


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
        category_budget_repo: CategoryBudgetRepository,
        transaction_repo: TransactionRepository,
        emitter: NotificationEmitter,
        db_client: object,
    ) -> None:
        self._budget_repo = budget_repo
        self._category_budget_repo = category_budget_repo
        self._transaction_repo = transaction_repo
        self._emitter = emitter
        self._db = db_client

    def evaluate_after_debit(
        self,
        *,
        user_id: str,
        timezone: str,
        transaction_at_iso: str,
        category_id: str | None = None,
    ) -> None:
        local_day, year, month = _parse_transaction_local_day(
            transaction_at_iso,
            timezone,
        )
        month_key = f"{year}-{month:02d}"
        day_key = local_day.isoformat()

        if category_id:
            self._evaluate_category_budget(
                user_id=user_id,
                category_id=category_id,
                year=year,
                month=month,
                month_key=month_key,
                timezone=timezone,
            )

        budget_row = self._budget_repo.fetch_by_user_id(user_id)
        if budget_row is None:
            return

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

    def _evaluate_category_budget(
        self,
        *,
        user_id: str,
        category_id: str,
        year: int,
        month: int,
        month_key: str,
        timezone: str,
    ) -> None:
        cap_row = self._category_budget_repo.fetch_for_category(user_id, category_id)
        if cap_row is None:
            return
        monthly_cap = Decimal(str(cap_row.get("monthly_amount", 0)))
        if monthly_cap <= 0:
            return

        start, end = month_bounds_iso(year, month, timezone)
        spent = self._sum_debits_for_category(
            user_id,
            category_id,
            start,
            end,
        )

        meta = CategoryRepository.fetch_meta_by_ids(
            self._db,  # type: ignore[arg-type]
            {category_id},
            user_id=user_id,
        )
        name = "Category"
        row = meta.get(category_id)
        if isinstance(row, dict):
            raw_name = row.get("name")
            if isinstance(raw_name, str) and raw_name.strip():
                name = raw_name.strip()

        self._emit_thresholds(
            user_id=user_id,
            scope="category",
            period_key=month_key,
            spent=spent,
            cap=monthly_cap,
            category_id=category_id,
            title_80=f"80% of {name} budget used",
            title_100=f"{name} budget exceeded",
            body_80_template="You've spent {spent} of {cap} on {name} this month.",
            body_100_template="You're {over} over your {cap} {name} budget this month.",
            category_name=name,
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

    def _sum_debits_for_category(
        self,
        user_id: str,
        category_id: str,
        start: str,
        end: str,
    ) -> Decimal:
        blob = self._transaction_repo.fetch_transactions_period_summary(
            user_id,
            from_iso=start,
            to_iso=end,
        )
        if blob is not None:
            by_cat = _debit_by_category_from_period_blob(blob)
            return by_cat.get(category_id, Decimal("0"))

        rows = self._transaction_repo.iter_amount_type_category(
            user_id,
            from_iso=start,
            to_iso=end,
        )
        spent = Decimal("0")
        for row in rows:
            if row.get("type") != "debit":
                continue
            row_cat = row.get("category_id")
            if row_cat is None:
                continue
            if str(row_cat) == category_id:
                spent += Decimal(str(row.get("amount", "0")))
        return spent

    def _emit_thresholds(
        self,
        *,
        user_id: str,
        scope: Literal["monthly", "daily", "category"],
        period_key: str,
        spent: Decimal,
        cap: Decimal,
        title_80: str,
        title_100: str,
        body_80_template: str,
        body_100_template: str,
        category_id: str | None = None,
        category_name: str = "",
    ) -> None:
        pct = spent / cap
        spent_fmt = format_inr(spent)
        cap_fmt = format_inr(cap)
        name = category_name or "Category"

        if pct >= Decimal("0.8"):
            body_80 = body_80_template.format(
                spent=spent_fmt,
                cap=cap_fmt,
                over="",
                name=name,
            )
            if scope == "category" and category_id:
                self._emitter.emit_category_budget_threshold(
                    user_id=user_id,
                    category_id=category_id,
                    period_key=period_key,
                    threshold=80,
                    title=title_80,
                    body=body_80,
                )
            else:
                self._emitter.emit_budget_threshold(
                    user_id=user_id,
                    scope=scope,  # type: ignore[arg-type]
                    period_key=period_key,
                    threshold=80,
                    title=title_80,
                    body=body_80,
                )

        if pct > Decimal("1"):
            over = format_inr(spent - cap)
            body_100 = body_100_template.format(
                spent=spent_fmt,
                cap=cap_fmt,
                over=over,
                name=name,
            )
            if scope == "category" and category_id:
                self._emitter.emit_category_budget_threshold(
                    user_id=user_id,
                    category_id=category_id,
                    period_key=period_key,
                    threshold=100,
                    title=title_100,
                    body=body_100,
                )
            else:
                self._emitter.emit_budget_threshold(
                    user_id=user_id,
                    scope=scope,  # type: ignore[arg-type]
                    period_key=period_key,
                    threshold=100,
                    title=title_100,
                    body=body_100,
                )
