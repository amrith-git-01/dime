from functools import lru_cache
from typing import Annotated

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Loads Supabase project URL and API keys using current naming (publishable / secret).

    Supabase docs use ``SUPABASE_URL`` plus either ``SUPABASE_PUBLISHABLE_KEY`` or the generic
    ``SUPABASE_KEY`` (value is the publishable key). Secret key env: ``SUPABASE_SECRET_KEY``;
    ``SUPABASE_SERVICE_ROLE_KEY`` is accepted as a legacy alias for the same value.

    ``SUPABASE_JWT_SECRET`` (Dashboard: Project Settings → API → JWT Secret) is required only
    when verifying user JWTs in this API.

    ``API_LISTEN_HOST`` / ``API_LISTEN_PORT`` are kept for tooling; the app has no built-in
    server entrypoint. Run it with ``uv run python -m uvicorn main:app --reload`` (dev) or plain
    ``uvicorn main:app`` (production).
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
    private_storage_bucket: str = Field(
        default="Dime-private",
        validation_alias=AliasChoices("PRIVATE_STORAGE_BUCKET"),
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
    sms_worker_count: int = Field(
        default=2,
        validation_alias=AliasChoices("SMS_WORKER_COUNT"),
    )
    jobs_recovery_min_age_seconds: int = Field(
        default=120,
        validation_alias=AliasChoices("JOBS_RECOVERY_MIN_AGE_SECONDS"),
    )
    jobs_sweep_interval_seconds: float = Field(
        default=30.0,
        validation_alias=AliasChoices("JOBS_SWEEP_INTERVAL_SECONDS"),
    )
    jobs_max_attempts: int = Field(
        default=3,
        validation_alias=AliasChoices("JOBS_MAX_ATTEMPTS"),
    )
    jobs_shutdown_grace_seconds: float = Field(
        default=20.0,
        validation_alias=AliasChoices("JOBS_SHUTDOWN_GRACE_SECONDS"),
    )
    worker_queue_maxsize: int = Field(
        default=8,
        validation_alias=AliasChoices("WORKER_QUEUE_MAXSIZE"),
    )
    max_receipt_upload_bytes: int = Field(
        default=10 * 1024 * 1024,
        validation_alias=AliasChoices("MAX_RECEIPT_UPLOAD_BYTES"),
    )
    max_voice_upload_bytes: int = Field(
        default=15 * 1024 * 1024,
        validation_alias=AliasChoices("MAX_VOICE_UPLOAD_BYTES"),
    )
    signed_url_ttl_seconds: int = Field(
        default=6 * 60 * 60,
        validation_alias=AliasChoices("SIGNED_URL_TTL_SECONDS"),
    )
    avatar_url_allowed_hosts: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["api.dicebear.com"],
        validation_alias=AliasChoices("AVATAR_URL_ALLOWED_HOSTS"),
    )
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        validation_alias=AliasChoices("CORS_ORIGINS"),
    )
    agent_base_url: str = Field(
        default = "https://api.deepseek.com",
        validation_alias=AliasChoices("AGENT_BASE_URL"),

    )
    agent_model: str = Field(
        default="deepseek-v4-flash",
        validation_alias=AliasChoices("AGENT_MODEL"),
    )
    agent_model_fallback: str | None = Field(
        default=None,
        validation_alias=AliasChoices("AGENT_MODEL_FALLBACK"),
    )
    agent_thinking_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("AGENT_THINKING_ENABLED"),
    )
    agent_strict_tools: bool = Field(
        default=True,
        validation_alias=AliasChoices("AGENT_STRICT_TOOLS"),
    )
    agent_max_tool_rounds: int = Field(
        default=5,
        validation_alias=AliasChoices("AGENT_MAX_TOOL_ROUNDS"),
    )
    agent_timeout_seconds: float = Field(
        default=45.0,
        validation_alias=AliasChoices("AGENT_TIMEOUT_SECONDS"),
    )
    agent_context_max_messages: int = Field(
        default=20,
        validation_alias=AliasChoices("AGENT_CONTEXT_MAX_MESSAGES"),
    )
    database_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("DATABASE_URL"),
    )
    agent_sql_timeout_seconds: float = Field(
        default=3.0,
        validation_alias=AliasChoices("AGENT_SQL_TIMEOUT_SECONDS"),
    )
    agent_sql_max_rows: int = Field(
        default=500,
        validation_alias=AliasChoices("AGENT_SQL_MAX_ROWS"),
    )
    agent_sql_pool_min: int = Field(
        default=2,
        validation_alias=AliasChoices("AGENT_SQL_POOL_MIN"),
    )
    agent_sql_pool_max: int = Field(
        default=10,
        validation_alias=AliasChoices("AGENT_SQL_POOL_MAX"),
    )
    brevo_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("BREVO_API_KEY"),
    )
    email_from: str = Field(
        default="Dime <hello@localhost>",
        validation_alias=AliasChoices("EMAIL_FROM"),
    )
    email_unsubscribe_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices("EMAIL_UNSUBSCRIBE_SECRET"),
    )
    email_app_link: str = Field(
        default="https://play.google.com/store",
        validation_alias=AliasChoices("EMAIL_APP_LINK"),
    )
    email_cron_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices("EMAIL_CRON_SECRET"),
    )
    email_public_base_url: str = Field(
        default="http://127.0.0.1:8000",
        validation_alias=AliasChoices("EMAIL_PUBLIC_BASE_URL"),
    )
    email_asset_base_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("EMAIL_ASSET_BASE_URL"),
    )
    favqs_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("FAVQS_API_KEY"),
    )

    @field_validator("cors_origins", "avatar_url_allowed_hosts", mode="before")
    @classmethod
    def _split_comma_separated(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # pyright: ignore[reportCallIssue]
