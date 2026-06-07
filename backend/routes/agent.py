"""Agent threads + SSE chat."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from deps import get_current_user_id, get_supabase_service_client
from features.agent.repository import AgentRepository
from features.agent.schemas import (
    AgentMessageResponse,
    AgentThreadResponse,
    ChatRequest,
    CreateThreadRequest,
)
from features.agent.service import AgentService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agent", tags=["agent"])
_bearer = HTTPBearer()


def _service(supabase: Client = Depends(get_supabase_service_client)) -> AgentService:
    return AgentService(AgentRepository(supabase))


@router.get("/threads", response_model=list[AgentThreadResponse])
async def list_threads(
    user_id: str = Depends(get_current_user_id),
    service: AgentService = Depends(_service),
) -> list[AgentThreadResponse]:
    return service.list_threads(user_id)


@router.post("/threads", response_model=AgentThreadResponse, status_code=status.HTTP_201_CREATED)
async def create_thread(
    body: CreateThreadRequest,
    user_id: str = Depends(get_current_user_id),
    service: AgentService = Depends(_service),
) -> AgentThreadResponse:
    return service.create_thread(user_id, body)


@router.get("/threads/{thread_id}/messages", response_model=list[AgentMessageResponse])
async def list_messages(
    thread_id: UUID,
    user_id: str = Depends(get_current_user_id),
    service: AgentService = Depends(_service),
) -> list[AgentMessageResponse]:
    try:
        return service.list_messages(user_id, str(thread_id))
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_thread(
    thread_id: UUID,
    user_id: str = Depends(get_current_user_id),
    service: AgentService = Depends(_service),
) -> None:
    try:
        service.delete_thread(user_id, str(thread_id))
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/threads/{thread_id}/chat")
async def chat(
    thread_id: UUID,
    body: ChatRequest,
    user_id: str = Depends(get_current_user_id),
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    service: AgentService = Depends(_service),
) -> StreamingResponse:
    token = credentials.credentials

    async def event_stream():
        async for chunk in service.stream_chat(
            user_id=user_id,
            user_jwt=token,
            thread_id=thread_id,
            body=body,
        ):
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
