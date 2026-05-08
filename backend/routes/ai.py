from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from deps import get_current_user_id
from features.ai.schemas import (
    ParseExpenseResponse,
    ParseExpenseResult,
    ParseExpenseTextRequest,
    ParseMode,
)
from features.ai.service import AIOrchestratorService

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post(
    "/parse-expense",
    response_model=ParseExpenseResponse,
    status_code=status.HTTP_200_OK,
)
async def parse_expense(
    mode: ParseMode = Form(...),
    text: str | None = Form(None),
    file: UploadFile | None = File(None),
    _user_id: str = Depends(get_current_user_id),
) -> ParseExpenseResponse:
    service = AIOrchestratorService()

    if mode == ParseMode.sms:
        if not text or not text.strip():
            raise HTTPException(status_code=400, detail="text required for mode=sms")
        req = ParseExpenseTextRequest(mode=mode, text=text.strip())
        result: ParseExpenseResult = await service.parse_sms(req.text)
        return ParseExpenseResponse(mode=mode, result=result)

    if mode in (ParseMode.receipt, ParseMode.voice):
        if file is None:
            raise HTTPException(status_code=400, detail="file required for receipt/voice mode")

        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="uploaded file is empty")

        mime = file.content_type or "application/octet-stream"

        if mode == ParseMode.receipt:
            result = await service.parse_receipt(content, mime)
        else:
            result = await service.parse_voice(content, mime)

        return ParseExpenseResponse(mode=mode, result=result)

    raise HTTPException(status_code=400, detail="unsupported mode")