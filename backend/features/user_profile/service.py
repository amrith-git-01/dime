"""Profile read/update orchestration."""

from __future__ import annotations

import logging

from supabase import Client

from core.security import CurrentUser
from features.user_profile.repository import UserProfileRepository
from features.user_profile.schemas import MeResponse, ProfileUpdateBody

logger = logging.getLogger(__name__)


class UserProfileService:
    def __init__(self, supabase: Client) -> None:
        self._repo = UserProfileRepository(supabase)

    def get_me(self, user: CurrentUser) -> MeResponse:
        return self.get_me_with_welcome_flag(user)[0]

    def get_me_with_welcome_flag(self, user: CurrentUser) -> tuple[MeResponse, bool]:
        """Read the profile; write the email only when it changed (no write per call).

        The flag says whether a welcome email should be attempted: the users row is missing
        (new account) or its stored email just changed. ``email_sends`` still guarantees once.
        """
        row = self._repo.fetch_by_id(user.id)
        should_welcome = False
        if user.email:
            stored = row.get("email") if row is not None else None
            if row is None:
                should_welcome = True
            elif stored != user.email:
                should_welcome = True
                try:
                    self._repo.update_email_if_row_exists(user.id, user.email)
                except Exception:
                    logger.exception("Could not persist email for user id=%s", user.id)
        return self._row_to_me(user, row), should_welcome

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
