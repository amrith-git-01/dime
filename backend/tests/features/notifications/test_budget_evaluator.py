from __future__ import annotations

from unittest.mock import MagicMock

from features.notifications.budget_evaluator import BudgetThresholdEvaluator
from features.notifications.emitter import NotificationEmitter


_USER = "11111111-1111-1111-1111-111111111111"
_TX_AT = "2026-05-31T14:30:00+05:30"
_TZ = "Asia/Kolkata"


def _evaluator(
    *,
    monthly: str = "0",
    daily: str = "0",
    debit_total: str = "0",
) -> tuple[BudgetThresholdEvaluator, MagicMock]:
    budget_repo = MagicMock()
    budget_repo.fetch_by_user_id.return_value = {
        "monthly_budget": monthly,
        "daily_budget": daily,
    }
    transaction_repo = MagicMock()
    transaction_repo.fetch_transactions_period_summary.return_value = {
        "debit_total": debit_total,
    }
    emitter_repo = MagicMock()
    emitter = NotificationEmitter(emitter_repo)
    evaluator = BudgetThresholdEvaluator(
        budget_repo=budget_repo,
        category_budget_repo=MagicMock(),
        transaction_repo=transaction_repo,
        emitter=emitter,
        db_client=MagicMock(),
    )
    return evaluator, emitter_repo


def test_daily_only_budget_emits_when_exceeded() -> None:
    evaluator, repo = _evaluator(monthly="0", daily="500", debit_total="600")
    evaluator.evaluate_after_debit(
        user_id=_USER,
        timezone=_TZ,
        transaction_at_iso=_TX_AT,
    )
    keys = [call.args[0]["dedupe_key"] for call in repo.insert_deduped.call_args_list]
    assert "budget:daily:80:2026-05-31" in keys
    assert "budget:daily:100:2026-05-31" in keys
    assert not any(k.startswith("budget:monthly:") for k in keys)


def test_monthly_zero_does_not_block_daily() -> None:
    """Regression: early return on monthly_budget <= 0 skipped daily checks."""
    evaluator, repo = _evaluator(monthly="0", daily="100", debit_total="150")
    evaluator.evaluate_after_debit(
        user_id=_USER,
        timezone=_TZ,
        transaction_at_iso=_TX_AT,
    )
    assert repo.insert_deduped.called
    assert repo.insert_deduped.call_args.args[0]["dedupe_key"].startswith("budget:daily:")


def test_no_budget_row_is_noop() -> None:
    budget_repo = MagicMock()
    budget_repo.fetch_by_user_id.return_value = None
    emitter_repo = MagicMock()
    evaluator = BudgetThresholdEvaluator(
        budget_repo=budget_repo,
        category_budget_repo=MagicMock(),
        transaction_repo=MagicMock(),
        emitter=NotificationEmitter(emitter_repo),
        db_client=MagicMock(),
    )
    evaluator.evaluate_after_debit(
        user_id=_USER,
        timezone=_TZ,
        transaction_at_iso=_TX_AT,
    )
    emitter_repo.insert_deduped.assert_not_called()
