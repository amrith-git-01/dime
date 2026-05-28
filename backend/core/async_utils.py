"""Helpers to run blocking I/O off the FastAPI event loop (audit 4.1)."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import ParamSpec, TypeVar

P = ParamSpec("P")
T = TypeVar("T")


async def run_sync(func: Callable[P, T], /, *args: P.args, **kwargs: P.kwargs) -> T:
    """Execute a blocking callable in the default thread pool."""
    return await asyncio.to_thread(func, *args, **kwargs)
