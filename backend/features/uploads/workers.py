"""Job handlers for capture pipelines (receipt / voice / SMS).

Handlers are invoked by ``features.jobs.manager.JobManager`` workers. Media is never carried in
the job: the request path uploads it to the private bucket and the job stores the object path.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from fastapi import HTTPException
from supabase import Client

from core.async_utils import run_sync
from core.security import CurrentUser
from features.ai.preprocess.errors import OcrError, PreprocessError, TranscriptionError
from features.ai.schemas import ParseExpenseResult
from features.ai.service import AIOrchestratorService, AIParseError
from features.ai.voice_audio import VoiceAudioNormalizeError, normalize_audio_for_transcription
from features.notifications.emitter import NotificationEmitter
from features.notifications.push_tokens_repository import PushTokensRepository
from features.notifications.repository import NotificationRepository
from features.transactions.schemas import InternalTransactionCreate, TransactionResponse
from features.transactions.service import TransactionService
from features.user_settings.repository import UserSettingsRepository
from features.user_settings.service import UserSettingsService

from .storage import download_bytes

logger = logging.getLogger(__name__)

MAX_JOB_ATTEMPTS = 3


@dataclass(slots=True, frozen=True)
class ManualTransactionJob:
    user_id: str
    payload: InternalTransactionCreate
    timezone: str


@dataclass(slots=True, frozen=True)
class ReceiptJob:
    """Receipt already uploaded to the private bucket; the job stores only the object path."""

    user_id: str
    object_path: str
    mime_type: str
    timezone: str


@dataclass(slots=True, frozen=True)
class VoiceJob:
    """Voice note already uploaded to the private bucket; the job stores only the object path."""

    user_id: str
    object_path: str
    mime_type: str
    timezone: str


@dataclass(slots=True, frozen=True)
class SmsJob:
    user_id: str
    body: str
    received_at: datetime
    timezone: str


def _build_user(user_id: str) -> CurrentUser:
    return CurrentUser(id=user_id)


def extract_upload_extension_from_mime(mime: str, *, fallback: str) -> str:
    lowered = mime.strip().lower()
    if "/" not in lowered:
        return fallback
    subtype = lowered.rsplit("/", maxsplit=1)[1]
    if "+" in subtype:
        subtype = subtype.split("+", maxsplit=1)[0]
    if subtype in {"jpeg", "jpg"}:
        return "jpg"
    if subtype in {"mpeg", "mp3"}:
        return "mp3"
    if subtype in {"wav", "x-wav"}:
        return "wav"
    if subtype:
        return subtype
    return fallback


async def load_category_options(
    client: Client,
    user_id: str,
) -> tuple[list[str], list[dict[str, str]]]:
    def _query() -> tuple[list[str], list[dict[str, str]]]:
        res = (
            client.table("categories")
            .select("id,name")
            .or_(f"is_system.eq.true,user_id.eq.{user_id}")
            .order("name", desc=False)
            .execute()
        )
        rows = res.data if isinstance(res.data, list) else []

        category_options: list[dict[str, str]] = []
        seen_names: set[str] = set()

        for row in rows:
            if not isinstance(row, dict):
                continue
            category_id = row.get("id")
            name_raw = row.get("name")
            if not isinstance(category_id, str) or not isinstance(name_raw, str):
                continue
            name = name_raw.strip()
            if not name:
                continue
            key = name.casefold()
            if key in seen_names:
                continue
            seen_names.add(key)
            category_options.append({"id": category_id, "name": name})

        allowed_categories = [item["name"] for item in category_options]
        if not allowed_categories:
            allowed_categories = ["Other"]
            category_options = [{"id": "", "name": "Other"}]
        return allowed_categories, category_options

    return await asyncio.to_thread(_query)


def _build_transaction_payload(
    parsed: ParseExpenseResult,
    *,
    detected_via: str,
    receipt_url: str | None = None,
    voice_url: str | None = None,
    fallback_at: datetime | None = None,
) -> InternalTransactionCreate:
    transaction_at = parsed.date or fallback_at or datetime.now(UTC)
    return InternalTransactionCreate(
        amount=parsed.amount,
        type=parsed.type.value,
        counterparty_name=parsed.counterparty_name,
        counterparty_type=parsed.counterparty_type,
        category=parsed.category,
        category_id=parsed.category_id,
        note=parsed.note,
        transaction_at=transaction_at,
        detected_via=detected_via,
        receipt_url=receipt_url,
        voice_url=voice_url,
    )


def _is_retryable_worker_error(exc: BaseException) -> bool:
    if isinstance(
        exc,
        httpx.TimeoutException | httpx.NetworkError | httpx.ConnectError | httpx.ReadError,
    ):
        return True
    if isinstance(exc, AIParseError):
        message = str(exc).lower()
        return "transient" in message
    if isinstance(exc, PreprocessError):
        message = str(exc).lower()
        return "transient" in message
    return False


async def _run_with_retries[T](
    *,
    label: str,
    user_id: str,
    step: Callable[[], Awaitable[T]],
) -> T:
    last_exc: BaseException | None = None
    for attempt in range(MAX_JOB_ATTEMPTS):
        try:
            return await step()
        except Exception as exc:
            last_exc = exc
            if not _is_retryable_worker_error(exc):
                raise
            if attempt >= MAX_JOB_ATTEMPTS - 1:
                logger.error(
                    "%s_failed_all_retries user_id=%s error=%s",
                    label,
                    user_id,
                    exc,
                )
                raise
            delay_s = 2**attempt
            logger.warning(
                "%s attempt %d/%d failed (retry in %ds): %s",
                label,
                attempt + 1,
                MAX_JOB_ATTEMPTS,
                delay_s,
                exc,
            )
            await asyncio.sleep(delay_s)
    raise last_exc if last_exc is not None else RuntimeError("retry loop exited")


async def process_manual_job(*, client: Client, job: ManualTransactionJob) -> TransactionResponse:
    service = TransactionService(client)
    user = _build_user(job.user_id)
    return await asyncio.to_thread(
        service.create_manual,
        user,
        job.payload,
        timezone=job.timezone,
    )


def _notify_capture_failed_sync(
    client: Client,
    *,
    user_id: str,
    source: str,
    title: str,
    body: str,
) -> None:
    settings_snapshot = UserSettingsService(UserSettingsRepository(client)).get_snapshot(user_id)
    NotificationEmitter(
        NotificationRepository(client),
        settings=settings_snapshot,
        push_tokens_repo=PushTokensRepository(client),
    ).emit_capture_failed(
        user_id=user_id,
        source=source,  # type: ignore[arg-type]
        title=title,
        body=body,
        day_key=datetime.now(UTC).date().isoformat(),
    )


async def _notify_capture_failed(
    client: Client,
    *,
    user_id: str,
    source: str,
    title: str,
    body: str,
) -> None:
    """Blocking Supabase/Expo calls run in a thread; a notification failure never masks the job error."""
    try:
        await run_sync(
            _notify_capture_failed_sync,
            client,
            user_id=user_id,
            source=source,
            title=title,
            body=body,
        )
    except Exception:
        logger.exception("capture_failed notification failed user_id=%s", user_id)


async def process_receipt_job(
    *,
    client: Client,
    bucket: str,
    job: ReceiptJob,
) -> TransactionResponse:
    try:
        return await _process_receipt_job_inner(client=client, bucket=bucket, job=job)
    except Exception:
        await _notify_capture_failed(
            client,
            user_id=job.user_id,
            source="scan",
            title="Receipt scan failed",
            body="We couldn't read this receipt. Try again or add manually.",
        )
        raise


async def _process_receipt_job_inner(
    *,
    client: Client,
    bucket: str,
    job: ReceiptJob,
) -> TransactionResponse:
    file_bytes = await download_bytes(client=client, bucket=bucket, object_path=job.object_path)

    allowed_categories, category_options = await load_category_options(
        client,
        job.user_id,
    )

    async def _parse_and_save() -> TransactionResponse:
        try:
            parsed = await AIOrchestratorService().parse_receipt(
                file_bytes,
                job.mime_type,
                allowed_categories,
                category_options,
            )
        except (HTTPException, OcrError) as exc:
            logger.error(
                "receipt_parse_non_retryable user_id=%s error=%s",
                job.user_id,
                exc,
            )
            raise
        payload = _build_transaction_payload(
            parsed,
            detected_via="scan",
            receipt_url=job.object_path,
        )
        return await process_manual_job(
            client=client,
            job=ManualTransactionJob(
                user_id=job.user_id,
                payload=payload,
                timezone=job.timezone,
            ),
        )

    return await _run_with_retries(
        label="receipt_parse",
        user_id=job.user_id,
        step=_parse_and_save,
    )


async def process_voice_job(
    *,
    client: Client,
    bucket: str,
    job: VoiceJob,
) -> TransactionResponse:
    file_bytes = await download_bytes(client=client, bucket=bucket, object_path=job.object_path)
    logger.info(
        "[voice-pipeline] job-start user_id=%s mime=%s in_bytes=%d",
        job.user_id,
        job.mime_type,
        len(file_bytes),
    )

    normalized_bytes, normalized_format = await asyncio.to_thread(
        normalize_audio_for_transcription,
        file_bytes,
        job.mime_type,
    )
    normalized_mime = "audio/wav" if normalized_format == "wav" else "audio/mpeg"
    logger.info(
        "[voice-pipeline] normalized format=%s mime=%s out_bytes=%d",
        normalized_format,
        normalized_mime,
        len(normalized_bytes),
    )

    allowed_categories, category_options = await load_category_options(
        client,
        job.user_id,
    )
    logger.info(
        "[voice-pipeline] categories-loaded count=%d sample=%s",
        len(allowed_categories),
        allowed_categories[:5],
    )

    async def _parse_and_save() -> TransactionResponse:
        logger.info(
            "[voice-pipeline] ai-call-start mode=voice mime=%s audio_bytes=%d",
            normalized_mime,
            len(normalized_bytes),
        )
        try:
            parsed = await AIOrchestratorService().parse_voice(
                normalized_bytes,
                normalized_mime,
                allowed_categories,
                category_options,
            )
        except (HTTPException, TranscriptionError, VoiceAudioNormalizeError) as exc:
            logger.error(
                "voice_parse_non_retryable user_id=%s error=%s",
                job.user_id,
                exc,
            )
            raise
        logger.info(
            "[voice-pipeline] ai-parsed model=%s amount=%s type=%s counterparty_name=%s "
            "category=%s confidence=%s date=%s",
            parsed.raw_model,
            parsed.amount,
            parsed.type.value,
            parsed.counterparty_name,
            parsed.category,
            parsed.confidence,
            parsed.date.isoformat() if parsed.date else None,
        )

        payload = _build_transaction_payload(
            parsed,
            detected_via="voice",
            voice_url=job.object_path,
        )
        logger.info(
            "[voice-pipeline] db-insert-start user_id=%s amount=%s type=%s voice_url=%s",
            job.user_id,
            payload.amount,
            payload.type,
            payload.voice_url,
        )
        created = await process_manual_job(
            client=client,
            job=ManualTransactionJob(
                user_id=job.user_id,
                payload=payload,
                timezone=job.timezone,
            ),
        )
        logger.info("[voice-pipeline] db-insert-done user_id=%s", job.user_id)
        return created

    return await _run_with_retries(
        label="voice_parse",
        user_id=job.user_id,
        step=_parse_and_save,
    )


async def process_sms_job(*, client: Client, job: SmsJob) -> TransactionResponse:
    try:
        return await _process_sms_job_inner(client=client, job=job)
    except Exception:
        await _notify_capture_failed(
            client,
            user_id=job.user_id,
            source="sms",
            title="SMS capture failed",
            body="We couldn't read this bank message. Try again or add manually.",
        )
        raise


async def _process_sms_job_inner(*, client: Client, job: SmsJob) -> TransactionResponse:
    allowed_categories, category_options = await load_category_options(
        client,
        job.user_id,
    )

    async def _parse_and_save() -> TransactionResponse:
        parsed = await AIOrchestratorService().parse_sms(
            job.body,
            allowed_categories,
            category_options,
        )
        payload = _build_transaction_payload(
            parsed,
            detected_via="sms",
            fallback_at=job.received_at,
        )
        return await process_manual_job(
            client=client,
            job=ManualTransactionJob(
                user_id=job.user_id,
                payload=payload,
                timezone=job.timezone,
            ),
        )

    return await _run_with_retries(
        label="sms_parse",
        user_id=job.user_id,
        step=_parse_and_save,
    )
