"""Supabase client factory (service role) for trusted server-side database and Storage access."""

from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from core.config import get_settings


@lru_cache
def _service_client(url: str, secret_key: str) -> Client:
    return create_client(url, secret_key)


def create_supabase_service_client() -> Client:
    """Return a Supabase client using the secret (service role) key.

    Raises:
        ValueError: If ``SUPABASE_SECRET_KEY`` / service role key is not configured.
    """
    settings = get_settings()
    if not settings.supabase_secret_key:
        msg = "SUPABASE_SECRET_KEY (service role) is required for this operation."
        raise ValueError(msg)
    return _service_client(settings.supabase_url, settings.supabase_secret_key)
