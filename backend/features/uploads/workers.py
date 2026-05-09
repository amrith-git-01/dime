from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from supabase import Client

from core.security import CurrentUser
from features.ai.schemas import ParseExpenseResult
from features.ai.service import AIOrchestratorService
from features.ai.voice_audio import normalize_voice_audio_for_nvidia
from features.transactions.schemas import TransactionCreate
from features.transactions.service import TransactionService

from .storage import upload_bytes

logger = logging.getLogger(__name__)


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


async def load_category_options(client: Client) -> tuple[list[str], list[dict[str, str]]]:
    def _query() -> tuple[list[str], list[dict[str, str]]]:
        categories_res = client.table("categories").select("id,name").execute()
        categories_rows = categories_res.data if isinstance(categories_res.data, list) else []
        category_options = [
            {"id": row["id"], "name": row["name"].strip()}
            for row in categories_rows
            if isinstance(row, dict)
            and isinstance(row.get("id"), str)
            and isinstance(row.get("name"), str)
            and row["name"].strip()
        ]
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

    allowed_categories, category_options = await load_category_options(client)
    parsed = await AIOrchestratorService().parse_receipt(
        job.file_bytes,
        job.mime_type,
        allowed_categories,
        category_options,
    )
    payload = _build_transaction_payload(
        parsed,
        detected_via="scan",
        receipt_url=upload.public_url,
    )
    await process_manual_job(
        client=client,
        job=ManualTransactionJob(user_id=job.user_id, payload=payload),
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
        normalize_voice_audio_for_nvidia,
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

    allowed_categories, category_options = await load_category_options(client)
    logger.info(
        "[voice-pipeline] categories-loaded count=%d sample=%s",
        len(allowed_categories),
        allowed_categories[:5],
    )

    logger.info(
        "[voice-pipeline] ai-call-start mode=voice mime=%s audio_bytes=%d",
        normalized_mime,
        len(normalized_bytes),
    )
    parsed = await AIOrchestratorService().parse_voice(
        normalized_bytes,
        normalized_mime,
        allowed_categories,
        category_options,
    )
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
