from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import MagicMock
from uuid import UUID

import pytest
from langchain_core.messages import AIMessage

from features.agent.repository import AgentRepository
from features.agent.schemas import ChatRequest, CreateThreadRequest
from features.agent.service import AgentService

_USER = "11111111-1111-1111-1111-111111111111"
_THREAD_ID = UUID("22222222-2222-2222-2222-222222222222")
_THREAD_ROW = {
    "id": str(_THREAD_ID),
    "user_id": _USER,
    "title": "",
    "created_at": "2026-06-01T00:00:00+00:00",
    "updated_at": "2026-06-01T00:00:00+00:00",
}


@pytest.fixture
def repo() -> MagicMock:
    return MagicMock(spec=AgentRepository)


@pytest.fixture
def service(repo: MagicMock) -> AgentService:
    return AgentService(repo)


def test_list_threads(service: AgentService, repo: MagicMock) -> None:
    repo.list_threads.return_value = [
        {
            "id": str(_THREAD_ID),
            "title": "Food spend",
            "created_at": "2026-06-01T00:00:00+00:00",
            "updated_at": "2026-06-02T00:00:00+00:00",
        }
    ]

    threads = service.list_threads(_USER)
    assert len(threads) == 1
    assert threads[0].title == "Food spend"


def test_create_thread(service: AgentService, repo: MagicMock) -> None:
    repo.create_thread.return_value = {
        "id": str(_THREAD_ID),
        "title": "My thread",
        "created_at": "2026-06-01T00:00:00+00:00",
        "updated_at": "2026-06-01T00:00:00+00:00",
    }

    thread = service.create_thread(_USER, CreateThreadRequest(title="My thread"))
    assert thread.id == _THREAD_ID
    repo.create_thread.assert_called_once_with(_USER, title="My thread")


def test_list_messages_missing_thread(service: AgentService, repo: MagicMock) -> None:
    repo.get_thread.return_value = None
    with pytest.raises(ValueError, match="Thread not found"):
        service.list_messages(_USER, str(_THREAD_ID))


class _FakeGraph:
    def __init__(self, snapshots: list[dict[str, Any]]) -> None:
        self._snapshots = snapshots

    async def astream(
        self,
        state: dict[str, Any],
        *,
        config: dict[str, Any],
        stream_mode: str,
    ) -> AsyncIterator[dict[str, Any]]:
        del state, config, stream_mode
        for snap in self._snapshots:
            yield snap


@pytest.mark.asyncio
async def test_stream_chat_emits_sse_events(
    service: AgentService,
    repo: MagicMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    repo.get_thread.return_value = dict(_THREAD_ROW)
    repo.list_messages.return_value = [
        {
            "id": "msg-1",
            "thread_id": str(_THREAD_ID),
            "role": "user",
            "content": "Food spend in March?",
            "blocks_json": None,
            "deep_link_json": None,
            "created_at": "2026-06-01T00:00:00+00:00",
        }
    ]
    repo.insert_message.side_effect = [
        {"id": "msg-1"},
        {"id": "msg-2"},
    ]

    fake_graph = _FakeGraph(
        [
            {
                "query_rounds": 1,
                "last_result": {"row_count": 3},
                "reflection": {"status": "sufficient", "reason": "ok"},
                "messages": [AIMessage(content="You spent ₹3,200 on food.")],
                "sql_attempts": [{"sql": "SELECT 1", "round": 1}],
                "ui_blocks": [],
                "deep_link": None,
            }
        ]
    )
    monkeypatch.setattr("features.agent.service.agent_graph", fake_graph)

    chunks = [
        chunk
        async for chunk in service.stream_chat(
            user_id=_USER,
            user_jwt="jwt-token",
            thread_id=_THREAD_ID,
            body=ChatRequest(content="Food spend in March?"),
        )
    ]
    joined = "".join(chunks)

    assert "event: sql_start" in joined
    assert "event: sql_end" in joined
    assert "event: reflect" in joined
    assert "event: token" in joined
    assert "event: done" in joined
    repo.update_thread_title.assert_called_once()
