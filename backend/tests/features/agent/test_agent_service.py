from __future__ import annotations

from typing import Any

import pytest
from langchain_core.messages import AIMessage

from features.agent.schemas import ChatHistoryMessage, ChatRequest, ChatResponse
from features.agent.service import AgentService

_USER = "11111111-1111-1111-1111-111111111111"


@pytest.mark.asyncio
async def test_chat_returns_json_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = AgentService()
    final_state: dict[str, Any] = {
        "messages": [AIMessage(content="You spent ₹3,200 on food.")],
        "ui_blocks": [
            {
                "type": "mini_chart",
                "chart_kind": "donut",
                "payload": {"series": []},
            }
        ],
        "deep_link": {"screen": "transactions", "params": {"category": "food"}},
    }

    async def fake_ainvoke(
        state: dict[str, Any],
        *,
        config: dict[str, Any],
    ) -> dict[str, Any]:
        del config
        assert state["messages"]
        return final_state

    monkeypatch.setattr(
        "features.agent.service.agent_graph.ainvoke",
        fake_ainvoke,
    )

    result = await service.chat(
        user_id=_USER,
        user_jwt="jwt-token",
        body=ChatRequest(
            content="Food spend in March?",
            history=[
                ChatHistoryMessage(role="user", content="Hi"),
                ChatHistoryMessage(role="assistant", content="Hello!"),
            ],
        ),
    )

    assert isinstance(result, ChatResponse)
    assert result.answer == "You spent ₹3,200 on food."
    assert len(result.blocks) == 1
    assert result.deep_link == {"screen": "transactions", "params": {"category": "food"}}
