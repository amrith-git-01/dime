"""Agent chat (stateless — history supplied by client per request)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from deps import get_current_user_id
from features.agent.schemas import ChatRequest, ChatResponse
from features.agent.service import AgentService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])
_bearer = HTTPBearer()


def _service() -> AgentService:
    return AgentService()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> ChatResponse:
    token = credentials.credentials
    service = _service()

    try:
        return await service.chat(
            user_id=user_id,
            user_jwt=token,
            body=body,
        )
    except Exception as exc:
        logger.exception("Agent chat failed user_id=%s", user_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Agent request failed. Please try again.",
        ) from exc
