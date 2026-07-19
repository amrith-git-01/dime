from __future__ import annotations

from unittest.mock import MagicMock

from features.notifications.push_tokens_service import PushTokensService


def test_upsert_registers_token() -> None:
    repo = MagicMock()
    repo.upsert.return_value = {"expo_push_token": "ExponentPushToken[abc]"}
    service = PushTokensService(repo)
    out = service.register("user-1", token="ExponentPushToken[abc]", platform="android")
    repo.upsert.assert_called_once_with("user-1", "ExponentPushToken[abc]", "android")
    assert out.token == "ExponentPushToken[abc]"


def test_delete_specific_token() -> None:
    repo = MagicMock()
    service = PushTokensService(repo)
    service.unregister("user-1", token="ExponentPushToken[abc]")
    repo.delete_token.assert_called_once_with("user-1", "ExponentPushToken[abc]")


def test_delete_all_when_token_omitted() -> None:
    repo = MagicMock()
    service = PushTokensService(repo)
    service.unregister("user-1", token=None)
    repo.delete_all_for_user.assert_called_once_with("user-1")

