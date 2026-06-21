from __future__ import annotations

from typing import Any

from supabase import Client

from features.user_feedback.schemas import FeedbackType


class UserFeedbackRepository:
    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def insert(
        self,
        *,
        user_id: str,
        message: str,
        feedback_type: FeedbackType,
        reporter_email: str | None,
        reporter_username: str | None,
    ) -> dict[str, Any]:
        # postgrest-py sync: insert() returns SyncQueryRequestBuilder with execute only
        # (no chained .select()); representation comes back on execute().
        res = (
            self._db.table("user_feedback")
            .insert(
                {
                    "user_id": user_id,
                    "message": message,
                    "feedback_type": feedback_type,
                    "reporter_email": reporter_email,
                    "reporter_username": reporter_username,
                }
            )
            .execute()
        )
        data = res.data
        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            raise RuntimeError("user_feedback insert returned no row")
        return data[0]
