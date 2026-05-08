"""FastAPI application entry — health + user profile + avatar routes."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.job_runner import start_workers, stop_workers
from routes import categories, health, me, profile, transactions

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logging.getLogger("features").setLevel(logging.INFO)
logging.getLogger("core").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await start_workers(app)
    try:
        yield
    finally:
        await stop_workers(app)


def create_application() -> FastAPI:
    application = FastAPI(
        title="Dime API",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api_prefix = "/api/v1"
    application.include_router(health.router, prefix=api_prefix)
    application.include_router(me.router, prefix=api_prefix)
    application.include_router(profile.router, prefix=api_prefix)
    application.include_router(transactions.router, prefix=api_prefix)
    application.include_router(categories.router, prefix=api_prefix)

    @application.get("/")
    def read_root() -> dict[str, str]:
        return {"message": "Dime API", "docs": "/docs", "openapi": "/openapi.json"}

    return application


app = create_application()

if __name__ == "__main__":
    import uvicorn

    from core.config import get_settings

    settings = get_settings()
    uvicorn.run(
        "main:app",
        host=settings.api_listen_host,
        port=settings.api_listen_port,
        reload=True,
    )
