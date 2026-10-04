"""FastAPI application entry — health + user profile + avatar routes."""

import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from core.body_limit import ContentLengthLimitMiddleware
from core.config import get_settings
from core.errors import register_domain_error_handlers
from core.job_runner import start_workers, stop_workers
from core.request_id import RequestIdMiddleware, unhandled_exception_handler
from features.agent.sql_executor import close_sql_pool, init_sql_pool
from routes import (
    agent,
    budget,
    categories,
    email,
    feedback,
    health,
    me,
    notifications,
    profile,
    push_tokens,
    settings,
    transactions,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logging.getLogger("features").setLevel(logging.INFO)
logging.getLogger("core").setLevel(logging.INFO)
logging.getLogger("features.agent.trace").setLevel(logging.INFO)

_access_log = logging.getLogger("access")


class RequestTimingMiddleware(BaseHTTPMiddleware):
    """Logs method, path, status, and wall-clock duration for every request.

    Also injects an ``X-Process-Time-Ms`` response header so the mobile client
    can read per-call latency without a separate APM agent.
    """

    async def dispatch(self, request: Request, call_next: object) -> Response:
        start = time.perf_counter()
        response: Response = await call_next(request)  # type: ignore[operator]
        duration_ms = (time.perf_counter() - start) * 1_000
        response.headers["X-Process-Time-Ms"] = f"{duration_ms:.1f}"
        _access_log.info(
            "%s %s %d %.1fms",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response


def _warn_on_missing_secrets() -> None:
    settings = get_settings()
    if not settings.email_unsubscribe_secret:
        logging.getLogger(__name__).warning(
            "EMAIL_UNSUBSCRIBE_SECRET is not set: welcome/digest emails are disabled "
            "and unsubscribe links are rejected."
        )
    if not settings.email_cron_secret:
        logging.getLogger(__name__).warning(
            "EMAIL_CRON_SECRET is not set: POST /internal/email/run will reject all requests."
        )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    _warn_on_missing_secrets()
    await init_sql_pool()
    await start_workers(app)
    try:
        yield
    finally:
        await stop_workers(app)
        await close_sql_pool()


def create_application() -> FastAPI:
    application = FastAPI(
        title="Dime API",
        version="0.1.0",
        lifespan=lifespan,
    )
    api_prefix = "/api/v1"
    app_settings = get_settings()
    # Multipart envelope overhead on top of the file cap.
    envelope_bytes = 256 * 1024
    application.add_middleware(
        ContentLengthLimitMiddleware,
        limits={
            f"{api_prefix}/transactions/receipt": app_settings.max_receipt_upload_bytes + envelope_bytes,
            f"{api_prefix}/transactions/voice": app_settings.max_voice_upload_bytes + envelope_bytes,
        },
    )
    application.add_middleware(RequestTimingMiddleware)
    # The mobile client needs no CORS; origins are opt-in (e.g. a web build) via CORS_ORIGINS.
    cors_origins = app_settings.cors_origins
    if cors_origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    # Outermost so every response (and log line) carries the request ID.
    application.add_middleware(RequestIdMiddleware)
    register_domain_error_handlers(application)
    application.add_exception_handler(Exception, unhandled_exception_handler)

    application.include_router(health.router, prefix=api_prefix)
    application.include_router(me.router, prefix=api_prefix)
    application.include_router(profile.router, prefix=api_prefix)
    application.include_router(categories.router, prefix=api_prefix)
    application.include_router(transactions.router, prefix=api_prefix)
    application.include_router(budget.router, prefix=api_prefix)
    application.include_router(notifications.router, prefix=api_prefix)
    application.include_router(push_tokens.router, prefix=api_prefix)
    application.include_router(settings.router, prefix=api_prefix)
    application.include_router(feedback.router, prefix=api_prefix)
    application.include_router(email.router, prefix=api_prefix)
    application.include_router(agent.router, prefix=api_prefix)

    email_assets = Path(__file__).resolve().parent / "features" / "email" / "assets"
    if email_assets.is_dir():
        application.mount(
            "/static/email",
            StaticFiles(directory=str(email_assets)),
            name="email-assets",
        )

    @application.get("/")
    def read_root() -> dict[str, str]:
        return {"message": "Dime API", "docs": "/docs", "openapi": "/openapi.json"}

    return application


app = create_application()

# Run locally with:  uv run python -m uvicorn main:app --reload
# Production runs `uvicorn main:app` directly (no reload, no built-in server block).
