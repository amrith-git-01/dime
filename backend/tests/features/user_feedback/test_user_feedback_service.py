from __future__ import annotations

import pytest
from unittest.mock import MagicMock

from features.user_feedback.schemas import FeedbackCreateBody
from features.user_feedback.service import UserFeedbackService


def test_create_inserts_trimmed_message_with_type_and_reporter() -> None:
    repo = MagicMock()
    repo.insert.return_value = {"id": "fb-1"}
    profile_repo = MagicMock()
    profile_repo.fetch_by_id.return_value = {"username": "amrith"}
    service = UserFeedbackService(repo, profile_repo)

    result = service.create(
        "user-1",
        FeedbackCreateBody(type="bug", message="  hello world  "),
        email="amrith@example.com",
    )

    repo.insert.assert_called_once_with(
        user_id="user-1",
        message="hello world",
        feedback_type="bug",
        reporter_email="amrith@example.com",
        reporter_username="amrith",
    )
    assert result.id == "fb-1"


def test_create_rejects_short_message() -> None:
    repo = MagicMock()
    service = UserFeedbackService(repo)
    with pytest.raises(ValueError, match="at least 8"):
        service.create(
            "user-1",
            FeedbackCreateBody(type="idea", message="short"),
            email=None,
        )


def test_create_allows_missing_reporter_fields() -> None:
    repo = MagicMock()
    repo.insert.return_value = {"id": "fb-2"}
    profile_repo = MagicMock()
    profile_repo.fetch_by_id.return_value = None
    service = UserFeedbackService(repo, profile_repo)

    result = service.create(
        "user-1",
        FeedbackCreateBody(type="enhancement", message="please add dark mode"),
        email=None,
    )

    repo.insert.assert_called_once_with(
        user_id="user-1",
        message="please add dark mode",
        feedback_type="enhancement",
        reporter_email=None,
        reporter_username=None,
    )
    assert result.id == "fb-2"
