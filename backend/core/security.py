"""JWT verification helpers for Supabase-issued access tokens."""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import jwt
from fastapi import HTTPException, status
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError, PyJWKClientError
from pydantic import BaseModel

from core.config import get_settings


class CurrentUser(BaseModel):
    """Authenticated subject from the verified Supabase access token."""

    id: str
    email: str | None = None


def expected_jwt_issuer(supabase_url: str) -> str:
    return f"{supabase_url.rstrip('/')}/auth/v1"


@lru_cache
def _jwks_client(supabase_url: str) -> PyJWKClient:
    """Fetch signing keys from Supabase Auth (ES256/RS256 / JWT Signing Keys)."""
    jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return PyJWKClient(jwks_url)


def decode_supabase_user_jwt_payload(token: str) -> dict[str, Any]:
    """Verify Supabase access tokens.

    Supports:
    - **ES256 / RS256** — current Supabase default when JWT Signing Keys are enabled (JWKS).
    - **HS256** — legacy symmetric ``SUPABASE_JWT_SECRET`` (dashboard JWT Secret).
    """
    settings = get_settings()
    issuer = expected_jwt_issuer(settings.supabase_url)
    decode_kwargs: dict[str, Any] = {
        "audience": "authenticated",
        "issuer": issuer,
        "options": {"require": ["exp", "sub", "iss", "aud"]},
    }

    try:
        header = jwt.get_unverified_header(token)
    except jwt.exceptions.DecodeError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        ) from exc

    alg = header.get("alg") or "HS256"

    try:
        if alg in ("ES256", "RS256"):
            jwks = _jwks_client(settings.supabase_url)
            signing_key = jwks.get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=[alg],
                **decode_kwargs,
            )

        if alg != "HS256":
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail="Unsupported token signing algorithm.",
            )

        if not settings.supabase_jwt_secret:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Auth is not configured (missing SUPABASE_JWT_SECRET).",
            )
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            **decode_kwargs,
        )
    except HTTPException:
        raise
    except (InvalidTokenError, PyJWKClientError) as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        ) from exc


def decode_supabase_user_jwt(token: str) -> str:
    payload = decode_supabase_user_jwt_payload(token)
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject.",
        )
    return sub


def current_user_from_payload(payload: dict[str, Any]) -> CurrentUser:
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject.",
        )
    raw_email = payload.get("email")
    email = raw_email if isinstance(raw_email, str) else None
    return CurrentUser(id=sub, email=email)
