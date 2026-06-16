"""Wrapped LLM invocations with structured trace logging."""

from __future__ import annotations

import time
from collections.abc import Sequence
from typing import Any, TypeVar

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel

from features.agent.trace import log_llm_request, log_llm_response

_T = TypeVar("_T", bound=BaseModel)


def _model_name(llm: BaseChatModel) -> str | None:
    name = getattr(llm, "model_name", None) or getattr(llm, "model", None)
    return str(name) if name else None


async def agent_llm_ainvoke(
    llm: BaseChatModel,
    messages: Sequence[BaseMessage],
    *,
    node: str,
    config: RunnableConfig,
) -> BaseMessage:
    model = _model_name(llm)
    log_llm_request(node=node, config=config, messages=messages, model=model)
    start = time.perf_counter()
    response = await llm.ainvoke(messages, config=config)
    duration_ms = int((time.perf_counter() - start) * 1000)
    log_llm_response(
        node=node,
        config=config,
        message=response,
        duration_ms=duration_ms,
        model=model,
    )
    return response


async def agent_llm_ainvoke_structured(
    llm: BaseChatModel,
    schema: type[_T],
    messages: Sequence[BaseMessage],
    *,
    node: str,
    config: RunnableConfig,
) -> _T:
    """Invoke the LLM via with_structured_output() and trace the result.

    DeepSeek's tool-calling path enforces the Pydantic schema at the API level —
    the model cannot omit or misformat required fields.  The returned object is
    a validated Pydantic instance of ``schema``.
    """
    model = _model_name(llm)
    log_llm_request(node=node, config=config, messages=messages, model=model)
    start = time.perf_counter()

    structured = llm.with_structured_output(schema)
    result: _T = await structured.ainvoke(list(messages), config=config)  # type: ignore[assignment]

    duration_ms = int((time.perf_counter() - start) * 1000)
    log_llm_response(
        node=node,
        config=config,
        message=AIMessage(content=result.model_dump_json()),
        duration_ms=duration_ms,
        model=model,
    )
    return result
