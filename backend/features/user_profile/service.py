"""Profile read/update orchestration."""

from __future__ import annotations

from supabase import Client

from core.security import CurrentUser
from features.user_profile.repository import UserProfileRepository
from features.user_profile.schemas import MeResponse, ProfileUpdateBody


class UserProfileService:
    def __init__(self, supabase: Client) -> None:
        self._repo = UserProfileRepository(supabase)

    def get_me(self, user: CurrentUser) -> MeResponse:
        row = self._repo.fetch_by_id(user.id)
        return self._row_to_me(user, row)

    def update_profile(self, user: CurrentUser, body: ProfileUpdateBody) -> MeResponse:
        avatar_url: str | None = None
        if body.avatar_url is not None and body.avatar_url.strip() != "":
            avatar_url = body.avatar_url.strip()
        self._repo.upsert_profile(
            user_id=user.id,
            username=body.username.strip(),
            currency=body.currency.strip(),
            avatar_url=avatar_url,
        )
        fresh = self._repo.fetch_by_id(user.id)
        return self._row_to_me(user, fresh)

    @staticmethod
    def _row_to_me(user: CurrentUser, row: dict | None) -> MeResponse:
        if not row:
            return MeResponse(id=user.id, email=user.email)
        return MeResponse(
            id=user.id,
            email=user.email,
            username=row.get("username") if isinstance(row.get("username"), str) else None,
            avatar_url=row.get("avatar_url") if isinstance(row.get("avatar_url"), str) else None,
            currency=row.get("currency") if isinstance(row.get("currency"), str) else None,
        )
