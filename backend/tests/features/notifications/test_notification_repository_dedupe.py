"""B6: notification dedupe is one race-free upsert, not select-then-insert."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from features.notifications.repository import NotificationRepository

_ROW = {"user_id": "u1", "dedupe_key": "budget:monthly:80:2026-10", "kind": "budget_threshold"}


def test_insert_deduped_uses_upsert_ignore_duplicates_and_never_selects() -> None:
    db = MagicMock()
    upsert = db.table.return_value.upsert
    upsert.return_value.execute.return_value = MagicMock(data=[{"id": "n1", **_ROW}])

    created = NotificationRepository(db).insert_deduped(dict(_ROW))

    assert created is not None and created["id"] == "n1"
    args, kwargs = upsert.call_args
    assert args[0] == _ROW
    assert kwargs == {"on_conflict": "user_id,dedupe_key", "ignore_duplicates": True}
    db.table.return_value.select.assert_not_called()
    db.table.return_value.insert.assert_not_called()


def test_insert_deduped_returns_none_when_row_already_exists() -> None:
    db = MagicMock()
    db.table.return_value.upsert.return_value.execute.return_value = MagicMock(data=[])
    assert NotificationRepository(db).insert_deduped(dict(_ROW)) is None


def test_insert_deduped_requires_dedupe_key() -> None:
    with pytest.raises(ValueError):
        NotificationRepository(MagicMock()).insert_deduped({"user_id": "u1"})
