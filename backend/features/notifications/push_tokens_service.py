from __future__ import annotations

from features.notifications.push_tokens_repository import PushTokensRepository
from features.notifications.push_tokens_schemas import PushTokenResponse


class PushTokensService:
    def __init__(self, repo: PushTokensRepository) -> None:
        self._repo = repo

    def register(self, user_id: str, token: str, platform: str) -> PushTokenResponse:
        row = self._repo.upsert(user_id, token, platform)
        token_value = token
        if isinstance(row, dict):
            row_token = row.get("expo_push_token")
            if isinstance(row_token, str) and row_token:
                token_value = row_token
        return PushTokenResponse(token=token_value)

    def unregister(self, user_id: str, token: str | None) -> None:
        if token:
            self._repo.delete_token(user_id, token)
            return
        self._repo.delete_all_for_user(user_id)

