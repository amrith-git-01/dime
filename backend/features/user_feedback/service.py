from __future__ import annotations

from features.user_feedback.repository import UserFeedbackRepository
from features.user_feedback.schemas import FeedbackCreateBody, FeedbackCreateResponse
from features.user_profile.repository import UserProfileRepository


class UserFeedbackService:
    def __init__(
        self,
        repo: UserFeedbackRepository,
        profile_repo: UserProfileRepository | None = None,
    ) -> None:
        self._repo = repo
        self._profile_repo = profile_repo

    def create(
        self,
        user_id: str,
        body: FeedbackCreateBody,
        *,
        email: str | None = None,
    ) -> FeedbackCreateResponse:
        message = body.message.strip()
        if len(message) < 8:
            raise ValueError("message must be at least 8 characters")

        reporter_username: str | None = None
        if self._profile_repo is not None:
            row = self._profile_repo.fetch_by_id(user_id)
            if row is not None:
                username = row.get("username")
                if isinstance(username, str) and username.strip():
                    reporter_username = username.strip()

        reporter_email = email.strip() if isinstance(email, str) and email.strip() else None

        row = self._repo.insert(
            user_id=user_id,
            message=message,
            feedback_type=body.type,
            reporter_email=reporter_email,
            reporter_username=reporter_username,
        )
        return FeedbackCreateResponse(id=str(row["id"]))
