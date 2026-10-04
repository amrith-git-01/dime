"""Reject oversized uploads from the ``Content-Length`` header before the body is parsed."""

from __future__ import annotations

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


class ContentLengthLimitMiddleware:
    """Return 413 when a request to a limited path declares a body larger than its cap.

    ``limits`` maps an exact request path to the maximum declared ``Content-Length`` in bytes.
    Chunked bodies without a length are capped later while reading (see ``read_upload_capped``).
    """

    def __init__(self, app: ASGIApp, limits: dict[str, int]) -> None:
        self.app = app
        self._limits = limits

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        limit = self._limits.get(scope.get("path", "")) if scope["type"] == "http" else None
        if limit is not None:
            for name, value in scope.get("headers", []):
                if name == b"content-length" and value.isdigit() and int(value) > limit:
                    response = JSONResponse(
                        {"detail": "Request body too large."},
                        status_code=413,
                    )
                    await response(scope, receive, send)
                    return
        await self.app(scope, receive, send)
