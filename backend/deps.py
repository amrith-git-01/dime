"""FastAPI dependencies: authentication and Supabase client injection."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from core.db import create_supabase_service_client
from core.security import (
    CurrentUser,
    current_user_from_payload,
    decode_supabase_user_jwt,
    decode_supabase_user_jwt_payload,
)

security = HTTPBearer(auto_error=False)


async def get_supabase_service_client() -> Client:
    try:
        return create_supabase_service_client()
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server missing SUPABASE_SECRET_KEY (required for database / Storage).",
        ) from exc


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )
    return decode_supabase_user_jwt(credentials.credentials)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )
    payload = decode_supabase_user_jwt_payload(credentials.credentials)
    return current_user_from_payload(payload)
