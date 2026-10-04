"""Fire-and-forget tasks that the event loop cannot garbage-collect mid-flight (B5)."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any

logger = logging.getLogger(__name__)

# The loop only keeps weak references to tasks, so an un-awaited ``create_task`` result can be
# collected before it finishes. Holding strong references here keeps them alive until done.
_background_tasks: set[asyncio.Task[Any]] = set()


def _on_done(task: asyncio.Task[Any]) -> None:
    _background_tasks.discard(task)
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error(
            "background task %s failed",
            task.get_name(),
            exc_info=(type(exc), exc, exc.__traceback__),
        )


def spawn(coro: Coroutine[Any, Any, Any], *, name: str | None = None) -> asyncio.Task[Any]:
    """Schedule ``coro`` on the running loop and keep a strong reference until it finishes.

    Exceptions are logged instead of vanishing as "Task exception was never retrieved".
    """
    task = asyncio.get_running_loop().create_task(coro, name=name)
    _background_tasks.add(task)
    task.add_done_callback(_on_done)
    return task


def pending_background_tasks() -> int:
    return len(_background_tasks)


async def drain_background_tasks(timeout: float) -> None:
    """Wait up to ``timeout`` seconds for spawned tasks (used on shutdown)."""
    tasks = list(_background_tasks)
    if tasks:
        await asyncio.wait(tasks, timeout=timeout)
