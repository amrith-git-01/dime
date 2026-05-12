"""Resilience helpers for sync PostgREST calls (Supabase Python client / httpx)."""

from __future__ import annotations

import logging
import random
import time
from collections.abc import Callable
from typing import TypeVar

import httpx

logger = logging.getLogger(__name__)

T = TypeVar("T")

_TRANSIENT_HTTPX = (
    httpx.RemoteProtocolError,
    httpx.ReadTimeout,
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.WriteTimeout,
)


def execute_with_http_retry(
    run: Callable[[], T],
    *,
    attempts: int = 4,
    base_delay_seconds: float = 0.12,
) -> T:
    """Retry on transient HTTP disconnects / timeouts (common under HTTP/2 + many rows)."""
    delay = base_delay_seconds
    last: BaseException | None = None
    for i in range(attempts):
        try:
            return run()
        except _TRANSIENT_HTTPX as exc:
            last = exc
            if i == attempts - 1:
                logger.warning(
                    "PostgREST call failed after %s attempts: %s",
                    attempts,
                    exc,
                )
                raise
            jitter = random.uniform(0, 0.06)
            time.sleep(delay + jitter)
            delay *= 2
    raise RuntimeError(last)  # pragma: no cover
