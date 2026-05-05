from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Loads Supabase project URL and API keys using current naming (publishable / secret).

    Supabase docs use ``SUPABASE_URL`` plus either ``SUPABASE_PUBLISHABLE_KEY`` or the generic
    ``SUPABASE_KEY`` (value is the publishable key). Secret key env: ``SUPABASE_SECRET_KEY``;
    ``SUPABASE_SERVICE_ROLE_KEY`` is accepted as a legacy alias for the same value.

    ``SUPABASE_JWT_SECRET`` (Dashboard: Project Settings → API → JWT Secret) is required only
    when verifying user JWTs in this API.

    ``API_LISTEN_HOST`` / ``API_LISTEN_PORT`` (defaults ``0.0.0.0`` / ``8000``) are used when
    starting the app with ``python main.py`` from the backend directory.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_publishable_key: str = Field(
        validation_alias=AliasChoices("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_KEY"),
    )
    supabase_secret_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    )
    supabase_jwt_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_JWT_SECRET"),
    )
    api_listen_host: str = Field(
        default="0.0.0.0",
        validation_alias=AliasChoices("API_LISTEN_HOST"),
    )
    api_listen_port: int = Field(
        default=8000,
        validation_alias=AliasChoices("API_LISTEN_PORT"),
    )
    storage_bucket: str = Field(
        default="Dime",
        validation_alias=AliasChoices("STORAGE_BUCKET", "AVATAR_STORAGE_BUCKET"),
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]
