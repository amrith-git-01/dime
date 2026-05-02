"""FastAPI application entry — modular routers per https://fastapi.tiangolo.com/tutorial/bigger-applications/"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router as api_v1_router


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
    application.include_router(api_v1_router, prefix="/api/v1")

    @application.get("/")
    def read_root() -> dict[str, str]:
        return {"message": "Dime API", "docs": "/docs", "openapi": "/openapi.json"}

    return application


app = create_application()
