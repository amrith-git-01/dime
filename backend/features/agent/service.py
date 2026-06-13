"""Agent chat orchestration — graph invoke + SSE streaming."""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from core.config import get_settings
from features.agent.graph import agent_graph
from features.agent.repository import AgentRepository
from features.agent.schemas import (
    AgentMessageResponse,
    AgentThreadResponse,
    ChatRequest,
    CreateThreadRequest,
)
from features.agent.state import initial_agent_state

logger = logging.getLogger(__name__)


def _sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"


def _rows_to_messages(rows: list[dict[str, Any]]) -> list[BaseMessage]:
    out: list[BaseMessage] = []
    for row in rows:
        content = str(row.get("content") or "")
        role = row.get("role")
        if role == "user":
            out.append(HumanMessage(content=content))
        elif role == "assistant":
            out.append(AIMessage(content=content))
    return out


def _latest_assistant_text(messages: list[BaseMessage]) -> str:
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and isinstance(msg.content, str):
            return msg.content.strip()
    return ""


def _title_from_first_message(content: str, *, max_len: int = 80) -> str:
    one_line = " ".join(content.split())
    return one_line[:max_len] if len(one_line) > max_len else one_line


class AgentService:
    def __init__(self, repo: AgentRepository) -> None:
        self._repo = repo

    def list_threads(self, user_id: str) -> list[AgentThreadResponse]:
        return [AgentThreadResponse.model_validate(r) for r in self._repo.list_threads(user_id)]

    def create_thread(
        self, user_id: str, body: CreateThreadRequest
    ) -> AgentThreadResponse:
        row = self._repo.create_thread(user_id, title=body.title or "")
        return AgentThreadResponse.model_validate(row)

    def list_messages(self, user_id: str, thread_id: str) -> list[AgentMessageResponse]:
        if self._repo.get_thread(user_id, thread_id) is None:
            msg = "Thread not found"
            raise ValueError(msg)
        rows = self._repo.list_messages(thread_id)
        return [AgentMessageResponse.model_validate(r) for r in rows]

    def delete_thread(self, user_id: str, thread_id: str) -> None:
        if self._repo.get_thread(user_id, thread_id) is None:
            msg = "Thread not found"
            raise ValueError(msg)
        self._repo.delete_thread(user_id, thread_id)

    async def stream_chat(
        self,
        *,
        user_id: str,
        user_jwt: str,
        thread_id: UUID,
        body: ChatRequest,
    ) -> AsyncIterator[str]:
        thread = self._repo.get_thread(user_id, str(thread_id))
        if thread is None:
            yield _sse("error", {"code": "not_found", "message": "Thread not found"})
            return

        self._repo.insert_message(
            thread_id=str(thread_id),
            role="user",
            content=body.content,
        )

        if not (thread.get("title") or "").strip():
            self._repo.update_thread_title(
                user_id, str(thread_id), _title_from_first_message(body.content)
            )

        settings = get_settings()
        history_rows = self._repo.list_messages(
            str(thread_id), limit=settings.agent_context_max_messages
        )
        state = initial_agent_state()
        state["messages"] = _rows_to_messages(history_rows)

        config = {
            "configurable": {
                "user_id": user_id,
                "user_jwt": user_jwt,
            }
        }

        last_rounds = 0
        last_reflection: dict[str, Any] | None = None
        final_state: dict[str, Any] | None = None

        try:
            async for snapshot in agent_graph.astream(
                state,
                config=config,
                stream_mode="values",
            ):
                rounds = int(snapshot.get("query_rounds") or 0)
                if rounds > last_rounds:
                    yield _sse("sql_start", {"round": rounds})
                    last_result = snapshot.get("last_result") or {}
                    row_count = int(last_result.get("row_count") or 0)
                    yield _sse(
                        "sql_end",
                        {
                            "round": rounds,
                            "row_count": row_count,
                            "summary": f"{row_count} rows",
                        },
                    )
                    last_rounds = rounds

                reflection = snapshot.get("reflection")
                if reflection and reflection != last_reflection:
                    yield _sse(
                        "reflect",
                        {
                            "status": reflection.get("status", "retry"),
                            "reason": reflection.get("reason", ""),
                        },
                    )
                    last_reflection = reflection

                final_state = snapshot

        except Exception as exc:
            logger.exception("Agent graph failed thread_id=%s", thread_id)
            yield _sse(
                "error",
                {"code": "agent_failed", "message": str(exc)},
            )
            return

        if final_state is None:
            yield _sse("error", {"code": "agent_failed", "message": "No graph output"})
            return

        answer = _latest_assistant_text(final_state.get("messages") or [])
        if answer:
            yield _sse("token", {"text": answer})

        for block in final_state.get("ui_blocks") or []:
            yield _sse("block", {"block": block})

        deep_link = final_state.get("deep_link")
        if isinstance(deep_link, dict) and deep_link.get("screen"):
            yield _sse(
                "deep_link",
                {
                    "screen": deep_link["screen"],
                    "params": deep_link.get("params") or {},
                },
            )

        saved = self._repo.insert_message(
            thread_id=str(thread_id),
            role="assistant",
            content=answer,
            blocks_json=final_state.get("ui_blocks") or None,
            deep_link_json=final_state.get("deep_link"),
            tool_calls_json=final_state.get("sql_attempts") or None,
        )

        yield _sse("done", {"message_id": saved["id"]})
