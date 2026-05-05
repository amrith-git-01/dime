"""FastAPI application entry — health + user profile + avatar routes."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import health, me, profile


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


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
