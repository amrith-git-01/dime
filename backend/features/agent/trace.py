"""Structured trace logging for the agent graph (nodes, LLM I/O, thinking)."""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import Mapping, Sequence
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.runnables import RunnableConfig

from features.agent.state import AgentState

logger = logging.getLogger("features.agent.trace")

_MAX_LOG_CHARS = 12_000
_MAX_REASONING_CHARS = 8_000
_MAX_ROW_PREVIEW = 3
_TRACE_ID_KEY = "trace_id"


def new_trace_id() -> str:
    return uuid.uuid4().hex[:16]


def trace_id_from_config(config: RunnableConfig | Mapping[str, Any] | None) -> str:
    if config is None:
        return "unknown"
    configurable = config.get("configurable") if isinstance(config, dict) else None
    if not isinstance(configurable, dict):
        return "unknown"
    raw = configurable.get(_TRACE_ID_KEY)
    return str(raw) if raw else "unknown"


def user_id_from_config(config: RunnableConfig | Mapping[str, Any] | None) -> str | None:
    if config is None or not isinstance(config, dict):
        return None
    configurable = config.get("configurable")
    if not isinstance(configurable, dict):
        return None
    raw = configurable.get("user_id")
    return str(raw) if raw else None


def _truncate(value: str, *, limit: int = _MAX_LOG_CHARS) -> str:
    if len(value) <= limit:
        return value
    return f"{value[:limit]}… [truncated {len(value) - limit} chars]"


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return str(value)


def _emit(event: str, **fields: Any) -> None:
    payload = {"event": event, **_json_safe(fields)}
    try:
        line = json.dumps(payload, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        line = json.dumps({"event": event, "error": "failed to serialize trace payload"})
    logger.info("agent_trace %s", line)


def state_summary(state: AgentState) -> dict[str, Any]:
    last_result = state.get("last_result") or {}
    rows = last_result.get("rows") if isinstance(last_result, dict) else None
    row_preview: list[Any] = []
    if isinstance(rows, list):
        row_preview = rows[:_MAX_ROW_PREVIEW]

    return {
        "time_range": state.get("time_range"),
        "next_sql_hint": state.get("next_sql_hint"),
        "query_rounds": state.get("query_rounds", 0),
        "sql_attempt_count": len(state.get("sql_attempts") or []),
        "last_row_count": last_result.get("row_count") if isinstance(last_result, dict) else None,
        "last_sql_error": last_result.get("error") if isinstance(last_result, dict) else None,
        "has_fatal_error": bool(state.get("error")),
        "row_preview": row_preview,
    }


def serialize_messages(messages: Sequence[BaseMessage]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for msg in messages:
        entry: dict[str, Any] = {
            "type": getattr(msg, "type", msg.__class__.__name__),
            "content": _truncate(str(msg.content)) if msg.content is not None else None,
        }
        if isinstance(msg, AIMessage):
            reasoning = extract_reasoning(msg)
            if reasoning:
                entry["reasoning_content"] = _truncate(
                    reasoning, limit=_MAX_REASONING_CHARS
                )
            tool_calls = getattr(msg, "tool_calls", None) or []
            if tool_calls:
                entry["tool_calls"] = _json_safe(tool_calls)
        if isinstance(msg, ToolMessage):
            entry["tool_call_id"] = msg.tool_call_id
        out.append(entry)
    return out


def extract_reasoning(message: BaseMessage) -> str | None:
    """Pull model thinking / reasoning text when the provider returns it."""
    if not isinstance(message, AIMessage):
        return None

    kwargs = message.additional_kwargs or {}
    raw = kwargs.get("reasoning_content")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()

    meta = message.response_metadata or {}
    for key in ("reasoning_content", "reasoning"):
        candidate = meta.get(key)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()

    return None


def log_turn_start(
    *,
    trace_id: str,
    user_id: str,
    user_message: str,
    history_count: int,
    timezone: str | None,
) -> None:
    _emit(
        "turn_start",
        trace_id=trace_id,
        user_id=user_id,
        user_message=_truncate(user_message),
        history_count=history_count,
        timezone=timezone,
    )


def log_turn_complete(
    *,
    trace_id: str,
    user_id: str,
    duration_ms: int,
    answer: str,
    block_count: int,
    deep_link: dict[str, Any] | None,
) -> None:
    _emit(
        "turn_complete",
        trace_id=trace_id,
        user_id=user_id,
        duration_ms=duration_ms,
        answer=_truncate(answer),
        block_count=block_count,
        deep_link=deep_link,
    )


def log_node_start(
    *,
    node: str,
    config: RunnableConfig,
    state: AgentState | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    fields: dict[str, Any] = {
        "trace_id": trace_id_from_config(config),
        "user_id": user_id_from_config(config),
        "node": node,
    }
    if state is not None:
        fields["state"] = state_summary(state)
    if extra:
        fields["extra"] = extra
    _emit("node_start", **fields)


def _serialize_output_messages(msgs: Sequence[Any]) -> list[dict[str, Any]]:
    if not msgs:
        return []
    if isinstance(msgs[0], BaseMessage):
        return serialize_messages(msgs)  # type: ignore[arg-type]
    return [
        {"type": "serialized", "content": _truncate(str(msg))}
        for msg in msgs
    ]


def log_node_complete(
    *,
    node: str,
    config: RunnableConfig,
    duration_ms: int,
    output: dict[str, Any] | None = None,
) -> None:
    safe_output: dict[str, Any] | None = None
    if output:
        body = dict(output)
        msgs = body.pop("messages", None)
        safe_output = _json_safe(body)
        if not isinstance(safe_output, dict):
            safe_output = {"value": safe_output}
        if msgs is not None:
            safe_output["messages"] = _serialize_output_messages(msgs)
    _emit(
        "node_complete",
        trace_id=trace_id_from_config(config),
        user_id=user_id_from_config(config),
        node=node,
        duration_ms=duration_ms,
        output=safe_output,
    )


def log_node_error(
    *,
    node: str,
    config: RunnableConfig,
    duration_ms: int,
    error: str,
) -> None:
    _emit(
        "node_error",
        trace_id=trace_id_from_config(config),
        user_id=user_id_from_config(config),
        node=node,
        duration_ms=duration_ms,
        error=error,
    )


def log_llm_request(
    *,
    node: str,
    config: RunnableConfig,
    messages: Sequence[BaseMessage],
    model: str | None = None,
) -> None:
    _emit(
        "llm_request",
        trace_id=trace_id_from_config(config),
        user_id=user_id_from_config(config),
        node=node,
        model=model,
        messages=serialize_messages(messages),
    )


def log_llm_response(
    *,
    node: str,
    config: RunnableConfig,
    message: BaseMessage,
    duration_ms: int,
    model: str | None = None,
) -> None:
    content = message.content
    text = content if isinstance(content, str) else str(content)
    payload: dict[str, Any] = {
        "trace_id": trace_id_from_config(config),
        "user_id": user_id_from_config(config),
        "node": node,
        "model": model,
        "duration_ms": duration_ms,
        "content": _truncate(text),
    }
    reasoning = extract_reasoning(message)
    if reasoning:
        payload["reasoning_content"] = _truncate(reasoning, limit=_MAX_REASONING_CHARS)
    if isinstance(message, AIMessage):
        tool_calls = getattr(message, "tool_calls", None) or []
        if tool_calls:
            payload["tool_calls"] = _json_safe(tool_calls)
    usage = (message.response_metadata or {}).get("token_usage")
    if usage:
        payload["token_usage"] = _json_safe(usage)
    _emit("llm_response", **payload)


def log_sql_execution(
    *,
    node: str,
    config: RunnableConfig,
    sql: str,
    result: dict[str, Any],
    round_no: int,
) -> None:
    rows = result.get("rows")
    preview = rows[:_MAX_ROW_PREVIEW] if isinstance(rows, list) else []
    _emit(
        "sql_execution",
        trace_id=trace_id_from_config(config),
        user_id=user_id_from_config(config),
        node=node,
        round=round_no,
        sql=_truncate(sql),
        row_count=result.get("row_count"),
        elapsed_ms=result.get("elapsed_ms"),
        error=result.get("error"),
        truncated=result.get("truncated"),
        row_preview=_json_safe(preview),
    )


def node_timer() -> float:
    return time.perf_counter()


def elapsed_ms_since(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)
