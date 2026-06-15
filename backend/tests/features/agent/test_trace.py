from __future__ import annotations

import json
import logging

import pytest
from langchain_core.messages import AIMessage, SystemMessage

from features.agent.trace import (
    extract_reasoning,
    log_llm_response,
    new_trace_id,
    serialize_messages,
    trace_id_from_config,
)


def test_new_trace_id_length() -> None:
    assert len(new_trace_id()) == 16


def test_trace_id_from_config() -> None:
    config = {"configurable": {"trace_id": "abc123"}}
    assert trace_id_from_config(config) == "abc123"


def test_extract_reasoning_from_additional_kwargs() -> None:
    msg = AIMessage(
        content="answer",
        additional_kwargs={"reasoning_content": "step one then step two"},
    )
    assert extract_reasoning(msg) == "step one then step two"


def test_serialize_messages_includes_tool_calls() -> None:
    msg = AIMessage(
        content="",
        tool_calls=[
            {
                "name": "run_sql",
                "args": {"sql": "SELECT 1"},
                "id": "call_1",
                "type": "tool_call",
            }
        ],
    )
    serialized = serialize_messages([SystemMessage(content="sys"), msg])
    assert serialized[1]["tool_calls"][0]["name"] == "run_sql"


def test_log_llm_response_emits_json(caplog: pytest.LogCaptureFixture) -> None:
    logger_name = "features.agent.trace"
    with caplog.at_level(logging.INFO, logger=logger_name):
        log_llm_response(
            node="reflect",
            config={"configurable": {"trace_id": "t1", "user_id": "u1"}},
            message=AIMessage(
                content='{"status":"sufficient"}',
                additional_kwargs={"reasoning_content": "looks good"},
            ),
            duration_ms=42,
            model="deepseek-v4-flash",
        )

    assert any("agent_trace" in r.message for r in caplog.records)
    payload_line = next(r.message for r in caplog.records if "agent_trace" in r.message)
    json_str = payload_line.split("agent_trace ", 1)[1]
    payload = json.loads(json_str)
    assert payload["event"] == "llm_response"
    assert payload["node"] == "reflect"
    assert payload["reasoning_content"] == "looks good"
    assert payload["duration_ms"] == 42
