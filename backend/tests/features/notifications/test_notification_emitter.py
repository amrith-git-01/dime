from __future__ import annotations

from unittest.mock import MagicMock

from features.notifications.emitter import NotificationEmitter
from features.user_settings.snapshot import UserSettingsSnapshot

_USER = "11111111-1111-1111-1111-111111111111"
_TX_ID = "33333333-3333-3333-3333-333333333333"


def test_emit_transaction_auto_calls_insert_with_dedupe_key() -> None:
    repo = MagicMock()
    emitter = NotificationEmitter(repo)
    emitter.emit_transaction_auto(
        user_id=_USER,
        transaction_id=_TX_ID,
        title="₹500 added",
        body="Swiggy · Food",
    )
    repo.insert_deduped.assert_called_once()
    row = repo.insert_deduped.call_args.args[0]
    assert row["dedupe_key"] == f"transaction_auto:{_TX_ID}"
    assert row["kind"] == "transaction_auto"
    assert row["action_type"] == "transaction_detail"
    assert row["action_transaction_id"] == _TX_ID


def test_emit_capture_failed_scan_dedupe_daily() -> None:
    repo = MagicMock()
    emitter = NotificationEmitter(repo)
    emitter.emit_capture_failed(
        user_id=_USER,
        source="scan",
        title="Receipt scan failed",
        body="Try again.",
        day_key="2026-05-31",
    )
    repo.insert_deduped.assert_called_once()
    row = repo.insert_deduped.call_args.args[0]
    assert row["dedupe_key"] == "capture_failed:scan:2026-05-31"
    assert row["action_type"] == "manual_add"


def test_emit_budget_threshold_dedupe_month() -> None:
    repo = MagicMock()
    emitter = NotificationEmitter(repo)
    emitter.emit_budget_threshold(
        user_id=_USER,
        scope="monthly",
        period_key="2026-05",
        threshold=80,
        title="80% of monthly budget used",
        body="You've spent ₹20,000 of ₹25,000 this month.",
    )
    row = repo.insert_deduped.call_args.args[0]
    assert row["dedupe_key"] == "budget:monthly:80:2026-05"


def test_emit_budget_threshold_dedupe_daily() -> None:
    repo = MagicMock()
    emitter = NotificationEmitter(repo)
    emitter.emit_budget_threshold(
        user_id=_USER,
        scope="daily",
        period_key="2026-05-31",
        threshold=100,
        title="Daily budget exceeded",
        body="You're ₹50 over your ₹500 daily budget.",
    )
    row = repo.insert_deduped.call_args.args[0]
    assert row["dedupe_key"] == "budget:daily:100:2026-05-31"


def test_emit_transaction_auto_skipped_when_disabled() -> None:
    repo = MagicMock()
    emitter = NotificationEmitter(
        repo,
        settings=UserSettingsSnapshot(auto_capture_alerts_enabled=False),
    )
    emitter.emit_transaction_auto(
        user_id=_USER,
        transaction_id=_TX_ID,
        title="₹500 added",
        body="Swiggy",
    )
    repo.insert_deduped.assert_not_called()


def test_emit_budget_threshold_ignores_legacy_master_flag() -> None:
    """Scope gating lives in the evaluator; emitter always inserts when called."""
    repo = MagicMock()
    emitter = NotificationEmitter(
        repo,
        settings=UserSettingsSnapshot(budget_alerts_enabled=False),
    )
    emitter.emit_budget_threshold(
        user_id=_USER,
        scope="monthly",
        period_key="2026-06",
        threshold=80,
        title="80% used",
        body="body",
    )
    repo.insert_deduped.assert_called_once()


def test_emit_skips_push_when_device_notifications_disabled() -> None:
    repo = MagicMock()
    repo.insert_deduped.return_value = {
        "id": "n1",
        "kind": "transaction_auto",
        "title": "t",
        "body": "b",
    }
    tokens = MagicMock()
    emitter = NotificationEmitter(
        repo,
        settings=UserSettingsSnapshot(
            auto_capture_alerts_enabled=True,
            device_notifications_enabled=False,
        ),
        push_tokens_repo=tokens,
        push_send=MagicMock(),
    )
    emitter.emit_transaction_auto(user_id="u", transaction_id="tx", title="t", body="b")
    tokens.list_tokens.assert_not_called()


def test_emit_pushes_when_insert_succeeds() -> None:
    repo = MagicMock()
    repo.insert_deduped.return_value = {
        "id": "n1",
        "kind": "transaction_auto",
        "title": "₹10 added",
        "body": "Shop",
        "action_type": "transaction_detail",
        "action_transaction_id": "tx",
    }
    tokens = MagicMock()
    tokens.list_tokens.return_value = ["ExponentPushToken[x]"]
    send = MagicMock()
    emitter = NotificationEmitter(
        repo,
        settings=UserSettingsSnapshot(
            auto_capture_alerts_enabled=True,
            device_notifications_enabled=True,
        ),
        push_tokens_repo=tokens,
        push_send=send,
    )
    emitter.emit_transaction_auto(
        user_id="u",
        transaction_id="tx",
        title="₹10 added",
        body="Shop",
    )
    send.assert_called_once()
    kwargs = send.call_args.kwargs
    assert kwargs["tokens"] == ["ExponentPushToken[x]"]
    assert kwargs["title"] == "₹10 added"


def test_emit_skips_push_when_deduped() -> None:
    repo = MagicMock()
    repo.insert_deduped.return_value = None
    send = MagicMock()
    emitter = NotificationEmitter(
        repo,
        settings=UserSettingsSnapshot(
            auto_capture_alerts_enabled=True,
            device_notifications_enabled=True,
        ),
        push_tokens_repo=MagicMock(),
        push_send=send,
    )
    emitter.emit_transaction_auto(user_id="u", transaction_id="tx", title="t", body="b")
    send.assert_not_called()
