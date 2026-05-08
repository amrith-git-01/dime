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
        default="https://openrouter.ai/api/v1/chat/completions",
        validation_alias=AliasChoices("AI_BASE_URL"),
    )
    ai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("AI_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY"),
    )
    ai_model: str = Field(
        default="openai/gpt-4o-mini",
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
    ai_fallback_sms: str = Field(
        default="google:gemma-3-4b,google:gemma-3-12b,groq:llama-3.1-8b",
        validation_alias=AliasChoices("AI_FALLBACK_SMS"),
    )
    ai_fallback_receipt: str = Field(
        default="google:gemma-4-26b,google:gemma-4-31b,nvidia:gemma-3n-e4b",
        validation_alias=AliasChoices("AI_FALLBACK_RECEIPT"),
    )
    ai_fallback_voice: str = Field(
        default="nvidia:gemma-3n-e4b,nvidia:gemma-3n-e2b",
        validation_alias=AliasChoices("AI_FALLBACK_VOICE"),
    )
    google_model_gemma_3_4b: str = Field(
        default="gemma-3-4b-it",
        validation_alias=AliasChoices("GOOGLE_MODEL_GEMMA_3_4B"),
    )
    google_model_gemma_3_12b: str = Field(
        default="gemma-3-12b-it",
        validation_alias=AliasChoices("GOOGLE_MODEL_GEMMA_3_12B"),
    )
    google_model_gemma_4_26b: str = Field(
        default="gemma-2.5-pro",
        validation_alias=AliasChoices("GOOGLE_MODEL_GEMMA_4_26B"),
    )
    google_model_gemma_4_31b: str = Field(
        default="gemma-2.5-pro",
        validation_alias=AliasChoices("GOOGLE_MODEL_GEMMA_4_31B"),
    )
    groq_model_llama_3_1_8b: str = Field(
        default="llama-3.1-8b-instant",
        validation_alias=AliasChoices("GROQ_MODEL_LLAMA_3_1_8B"),
    )
    nvidia_model_gemma_3n_e4b: str = Field(
        default="google/gemma-3n-e4b-it",
        validation_alias=AliasChoices("NVIDIA_MODEL_GEMMA_3N_E4B"),
    )
    nvidia_model_gemma_3n_e2b: str = Field(
        default="google/gemma-3n-e2b-it",
        validation_alias=AliasChoices("NVIDIA_MODEL_GEMMA_3N_E2B"),
    )
    google_ai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("GOOGLE_AI_API_KEY"),
    )
    google_ai_base_url: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta",
        validation_alias=AliasChoices("GOOGLE_AI_BASE_URL"),
    )
    groq_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("GROQ_API_KEY"),
    )
    groq_base_url: str = Field(
        default="https://api.groq.com/openai/v1",
        validation_alias=AliasChoices("GROQ_BASE_URL"),
    )
    nvidia_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("NVIDIA_API_KEY"),
    )
    nvidia_base_url: str = Field(
        default="https://integrate.api.nvidia.com/v1",
        validation_alias=AliasChoices("NVIDIA_BASE_URL"),
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
