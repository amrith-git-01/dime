"""Domain errors mapped to HTTP responses by one handler (B7).

Services raise these (or ``HTTPException`` for one-off cases); routes no longer wrap calls in
``try/except Exception``. Anything unexpected falls through to the global 500 handler in
``core.request_id``.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class DomainError(Exception):
    status_code = 400
    default_detail = "Request could not be processed."

    def __init__(self, detail: str | None = None, *, headers: dict[str, str] | None = None) -> None:
        self.detail = detail or self.default_detail
        self.headers = headers
        super().__init__(self.detail)


class NotFoundError(DomainError):
    status_code = 404
    default_detail = "Not found."


class DomainValidationError(DomainError):
    status_code = 422
    default_detail = "Invalid request."


class ConflictError(DomainError):
    status_code = 409
    default_detail = "Conflict."


class ServiceBusyError(DomainError):
    """Temporary capacity problem (full queue, shutting down); the client may retry."""

    status_code = 503
    default_detail = "Service is busy. Try again."

    def __init__(self, detail: str | None = None, *, retry_after: int = 5) -> None:
        super().__init__(detail, headers={"Retry-After": str(retry_after)})


async def domain_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DomainError)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=exc.headers,
    )


def register_domain_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, domain_error_handler)
