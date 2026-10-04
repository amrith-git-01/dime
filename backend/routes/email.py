"""Welcome, digest cron, and signed unsubscribe."""

from __future__ import annotations

import hmac
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from supabase import Client

from core.async_utils import run_sync
from core.config import get_settings
from deps import get_supabase_service_client
from features.email.service import EmailService, unsubscribe_page_html

router = APIRouter(tags=["email"])


class DigestRunBody(BaseModel):
    kind: Literal["weekly", "monthly"]


@router.get("/email/unsubscribe", response_class=HTMLResponse)
async def unsubscribe_email(
    token: Annotated[str, Query(min_length=8)],
    supabase: Client = Depends(get_supabase_service_client),
) -> HTMLResponse:
    service = EmailService(supabase, get_settings())
    ok, kind = await run_sync(service.unsubscribe, token)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid unsubscribe link.")
    return HTMLResponse(unsubscribe_page_html(kind))


@router.post("/internal/email/run")
async def run_digest(
    body: DigestRunBody,
    x_email_cron_secret: Annotated[str | None, Header()] = None,
    supabase: Client = Depends(get_supabase_service_client),
) -> dict[str, int]:
    settings = get_settings()
    expected = settings.email_cron_secret
    if (
        not expected
        or not x_email_cron_secret
        or not hmac.compare_digest(x_email_cron_secret.encode(), expected.encode())
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Unauthorized.")
    service = EmailService(supabase, settings)
    sent = await run_sync(service.run_digest, body.kind)
    return {"sent": sent}
