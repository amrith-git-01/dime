"""Cloud AI routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

from core.config import get_settings
from deps import get_current_user_id
from features.ai.schemas import ReceiptParseResponse
from features.ai.service import CloudReceiptParseService
from utils.image_format import detect_image_format

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])

MAX_RECEIPT_BYTES = 8 * 1024 * 1024


@router.post("/receipt-parse", response_model=ReceiptParseResponse)
async def parse_receipt(
    _user_id: str = Depends(get_current_user_id),
    file: UploadFile = File(..., description="Receipt image (JPEG/PNG/WebP)."),
) -> ReceiptParseResponse:
    payload = await file.read()
    if not payload:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Empty image file.")
    if len(payload) > MAX_RECEIPT_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Image too large.")

    detected = detect_image_format(payload[:32])
    if not detected:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Unsupported image type.")
    _, content_type = detected

    try:
        return await CloudReceiptParseService(get_settings()).parse_receipt(
            image_bytes=payload,
            content_type=content_type,
        )
    except RuntimeError as exc:
        logger.exception("Cloud receipt parse failed")
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

