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
    ai_base_url: str = Field(
        default="https://api.deepseek.com/chat/completions",
        validation_alias=AliasChoices("AI_BASE_URL"),
    )
    ai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DEEPSEEK_API_KEY", "AI_API_KEY"),
    )
    ai_model: str = Field(
        default="deepseek-v4-flash",
        validation_alias=AliasChoices("AI_MODEL"),
    )
    ai_timeout_seconds: float = Field(
        default=25.0,
        validation_alias=AliasChoices("AI_TIMEOUT_SECONDS"),
    )
    ai_temperature: float = Field(
        default=0.1,
        validation_alias=AliasChoices("AI_TEMPERATURE"),
    )
    ai_parse_fallback: str = Field(
        default="deepseek:deepseek-v4-flash,deepseek:deepseek-chat",
        validation_alias=AliasChoices("AI_PARSE_FALLBACK"),
    )
    groq_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("GROQ_API_KEY"),
    )
    groq_base_url: str = Field(
        default="https://api.groq.com/openai/v1",
        validation_alias=AliasChoices("GROQ_BASE_URL"),
    )
    groq_whisper_primary: str = Field(
        default="whisper-large-v3-turbo",
        validation_alias=AliasChoices("GROQ_WHISPER_PRIMARY"),
    )
    groq_whisper_fallback: str = Field(
        default="whisper-large-v3",
        validation_alias=AliasChoices("GROQ_WHISPER_FALLBACK"),
    )
    groq_vision_ocr_model: str = Field(
        default="meta-llama/llama-4-scout-17b-16e-instruct",
        validation_alias=AliasChoices("GROQ_VISION_OCR_MODEL"),
    )
    image_worker_count: int = Field(
        default=2,
        validation_alias=AliasChoices("IMAGE_WORKER_COUNT"),
    )
    voice_worker_count: int = Field(
        default=2,
        validation_alias=AliasChoices("VOICE_WORKER_COUNT"),
    )
    manual_worker_count: int = Field(
        default=2,
        validation_alias=AliasChoices("MANUAL_WORKER_COUNT"),
    )
    worker_queue_maxsize: int = Field(
        default=32,
        validation_alias=AliasChoices("WORKER_QUEUE_MAXSIZE"),
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]
