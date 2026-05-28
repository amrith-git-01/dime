from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from fastapi import HTTPException
from supabase import Client

from core.security import CurrentUser
from features.ai.preprocess.errors import OcrError, PreprocessError, TranscriptionError
from features.ai.schemas import ParseExpenseResult
from features.ai.service import AIParseError, AIOrchestratorService
from features.ai.voice_audio import VoiceAudioNormalizeError, normalize_audio_for_transcription
from features.transactions.schemas import TransactionCreate
from features.transactions.service import TransactionService

from .storage import upload_bytes

logger = logging.getLogger(__name__)

MAX_JOB_ATTEMPTS = 3


@dataclass(slots=True, frozen=True)
class ManualTransactionJob:
    user_id: str
    payload: TransactionCreate


@dataclass(slots=True, frozen=True)
class ReceiptJob:
    user_id: str
    file_bytes: bytes
    mime_type: str


@dataclass(slots=True, frozen=True)
class VoiceJob:
    user_id: str
    file_bytes: bytes
    mime_type: str


def _build_user(user_id: str) -> CurrentUser:
    return CurrentUser(id=user_id)


def _extract_upload_extension_from_mime(mime: str, *, fallback: str) -> str:
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
        user_res = (
            client.table("user_categories")
            .select("id,name")
            .eq("user_id", user_id)
            .order("name", desc=False)
            .execute()
        )
        system_res = (
            client.table("categories")
            .select("id,name")
            .eq("is_system", True)
            .order("name", desc=False)
            .execute()
        )
        user_rows = user_res.data if isinstance(user_res.data, list) else []
        system_rows = system_res.data if isinstance(system_res.data, list) else []

        category_options: list[dict[str, str]] = []
        seen_names: set[str] = set()

        def _append_rows(rows: list[object]) -> None:
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

        _append_rows(user_rows)
        _append_rows(system_rows)

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
) -> TransactionCreate:
    transaction_at = parsed.date or datetime.now(UTC)
    return TransactionCreate(
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


async def _run_with_retries(
    *,
    label: str,
    user_id: str,
    step: Callable[[], Awaitable[None]],
) -> None:
    last_exc: BaseException | None = None
    for attempt in range(MAX_JOB_ATTEMPTS):
        try:
            await step()
            return
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
    if last_exc is not None:
        raise last_exc


async def process_manual_job(*, client: Client, job: ManualTransactionJob) -> None:
    service = TransactionService(client)
    user = _build_user(job.user_id)
    await asyncio.to_thread(service.create_manual, user, job.payload)


async def process_receipt_job(
    *,
    client: Client,
    bucket: str,
    job: ReceiptJob,
) -> None:
    upload = await upload_bytes(
        client=client,
        bucket=bucket,
        user_id=job.user_id,
        kind="receipts",
        file_bytes=job.file_bytes,
        content_type=job.mime_type,
        extension=_extract_upload_extension_from_mime(job.mime_type, fallback="jpg"),
    )

    allowed_categories, category_options = await load_category_options(
        client,
        job.user_id,
    )

    async def _parse_and_save() -> None:
        try:
            parsed = await AIOrchestratorService().parse_receipt(
                job.file_bytes,
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
            receipt_url=upload.public_url,
        )
        await process_manual_job(
            client=client,
            job=ManualTransactionJob(user_id=job.user_id, payload=payload),
        )

    await _run_with_retries(
        label="receipt_parse",
        user_id=job.user_id,
        step=_parse_and_save,
    )


async def process_voice_job(
    *,
    client: Client,
    bucket: str,
    job: VoiceJob,
) -> None:
    logger.info(
        "[voice-pipeline] job-start user_id=%s mime=%s in_bytes=%d",
        job.user_id,
        job.mime_type,
        len(job.file_bytes),
    )

    normalized_bytes, normalized_format = await asyncio.to_thread(
        normalize_audio_for_transcription,
        job.file_bytes,
        job.mime_type,
    )
    normalized_mime = "audio/wav" if normalized_format == "wav" else "audio/mpeg"
    logger.info(
        "[voice-pipeline] normalized format=%s mime=%s out_bytes=%d",
        normalized_format,
        normalized_mime,
        len(normalized_bytes),
    )

    upload = await upload_bytes(
        client=client,
        bucket=bucket,
        user_id=job.user_id,
        kind="voice_inputs",
        file_bytes=normalized_bytes,
        content_type=normalized_mime,
        extension=normalized_format,
    )
    logger.info(
        "[voice-pipeline] uploaded path=%s public_url=%s",
        upload.object_path,
        upload.public_url,
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

    async def _parse_and_save() -> None:
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
            voice_url=upload.public_url,
        )
        logger.info(
            "[voice-pipeline] db-insert-start user_id=%s amount=%s type=%s voice_url=%s",
            job.user_id,
            payload.amount,
            payload.type,
            payload.voice_url,
        )
        await process_manual_job(
            client=client,
            job=ManualTransactionJob(user_id=job.user_id, payload=payload),
        )
        logger.info("[voice-pipeline] db-insert-done user_id=%s", job.user_id)

    await _run_with_retries(
        label="voice_parse",
        user_id=job.user_id,
        step=_parse_and_save,
    )


async def run_manual_worker(
    *,
    worker_name: str,
    queue: asyncio.Queue[ManualTransactionJob],
    client: Client,
) -> None:
    while True:
        job = await queue.get()
        try:
            await process_manual_job(client=client, job=job)
        except Exception:
            logger.exception("%s failed to process manual transaction", worker_name)
        finally:
            queue.task_done()


async def run_receipt_worker(
    *,
    worker_name: str,
    queue: asyncio.Queue[ReceiptJob],
    client: Client,
    bucket: str,
) -> None:
    while True:
        job = await queue.get()
        try:
            await process_receipt_job(client=client, bucket=bucket, job=job)
        except Exception:
            logger.exception("%s failed to process receipt transaction", worker_name)
        finally:
            queue.task_done()


async def run_voice_worker(
    *,
    worker_name: str,
    queue: asyncio.Queue[VoiceJob],
    client: Client,
    bucket: str,
) -> None:
    while True:
        job = await queue.get()
        try:
            await process_voice_job(client=client, bucket=bucket, job=job)
        except Exception:
            logger.exception("%s failed to process voice transaction", worker_name)
        finally:
            queue.task_done()
