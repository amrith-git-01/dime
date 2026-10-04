"""Agent chat (stateless — history supplied by client per request)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from deps import get_current_user_id
from features.agent.schemas import ChatRequest, ChatResponse
from features.agent.service import AgentService
from features.agent.sql_executor import ensure_sql_pool

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
    # The pool may have failed at startup; retry lazily and answer 503 until it is up.
    if not await ensure_sql_pool():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Assistant is temporarily unavailable. Try again shortly.",
            headers={"Retry-After": "10"},
        )
    return await _service().chat(
        user_id=user_id,
        user_jwt=credentials.credentials,
        body=body,
    )
