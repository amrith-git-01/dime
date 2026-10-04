"""Request-ID propagation (pure ASGI) and the global unhandled-error handler (contract C8)."""

from __future__ import annotations

import logging
import re
import uuid
from contextvars import ContextVar

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"

# Request ID for the request currently being handled (``None`` outside a request).
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)

_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{8,128}$")


def _resolve_request_id(scope: Scope) -> str:
    wanted = REQUEST_ID_HEADER.lower().encode("latin-1")
    for name, value in scope.get("headers", []):
        if name != wanted:
            continue
        candidate = value.decode("latin-1").strip()
        if _SAFE_REQUEST_ID.fullmatch(candidate):
            return candidate
    return uuid.uuid4().hex


class RequestIdMiddleware:
    """Propagate (or generate) ``X-Request-ID``; echo it on every HTTP response.

    The ID is stored in ``scope["state"]["request_id"]`` (``request.state.request_id``) and in
    ``request_id_ctx`` so handlers and loggers can read it.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = _resolve_request_id(scope)
        scope.setdefault("state", {})["request_id"] = request_id
        token = request_id_ctx.set(request_id)

        async def send_with_request_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = [
                    (k, v)
                    for k, v in message.get("headers", [])
                    if k.lower() != REQUEST_ID_HEADER.lower().encode("latin-1")
                ]
                headers.append((REQUEST_ID_HEADER.lower().encode("latin-1"), request_id.encode()))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            request_id_ctx.reset(token)


def current_request_id(request: Request | None = None) -> str | None:
    if request is not None:
        state_id = getattr(request.state, "request_id", None)
        if isinstance(state_id, str):
            return state_id
    return request_id_ctx.get()


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Map any unhandled error to ``500 {"detail": "Internal error", "request_id": ...}``."""
    request_id = current_request_id(request)
    logger.error(
        "unhandled_exception request_id=%s method=%s path=%s",
        request_id,
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    headers = {REQUEST_ID_HEADER: request_id} if request_id else None
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal error", "request_id": request_id},
        headers=headers,
    )
