from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from core.async_utils import run_sync
from core.security import CurrentUser
from deps import get_current_user, get_supabase_service_client
from features.user_feedback.repository import UserFeedbackRepository
from features.user_feedback.schemas import FeedbackCreateBody, FeedbackCreateResponse
from features.user_feedback.service import UserFeedbackService
from features.user_profile.repository import UserProfileRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["feedback"])


@router.post("/feedback", response_model=FeedbackCreateResponse, status_code=201)
async def create_feedback(
    body: FeedbackCreateBody,
    user: CurrentUser = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_service_client),
) -> FeedbackCreateResponse:
    service = UserFeedbackService(
        UserFeedbackRepository(supabase),
        UserProfileRepository(supabase),
    )
    try:
        return await run_sync(
            service.create,
            user.id,
            body,
            email=user.email,
        )
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except Exception as exc:
        logger.exception("Failed to create feedback for user_id=%s", user.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Could not submit feedback.",
        ) from exc
