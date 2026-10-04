"""Classify Postgres / PostgREST errors raised by the Supabase client."""

from __future__ import annotations

UNIQUE_VIOLATION = "23505"
NO_DATA_FOUND = "P0002"


def _error_code(exc: BaseException) -> str | None:
    code = getattr(exc, "code", None)
    if isinstance(code, str) and code:
        return code
    if exc.args and isinstance(exc.args[0], dict):
        raw = exc.args[0].get("code")
        if isinstance(raw, str) and raw:
            return raw
    return None


def has_pg_code(exc: BaseException, code: str) -> bool:
    if _error_code(exc) == code:
        return True
    return f"'code': '{code}'" in str(exc) or f'"code": "{code}"' in str(exc)


def is_unique_violation(exc: BaseException) -> bool:
    """True for Postgres 23505 / PostgREST 409 conflicts (and only those)."""
    if has_pg_code(exc, UNIQUE_VIOLATION) or _error_code(exc) == "409":
        return True
    message = str(exc).lower()
    return "duplicate key" in message or "unique constraint" in message
