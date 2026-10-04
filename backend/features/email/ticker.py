from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import FastAPI
from supabase import Client

from core.config import get_settings
from features.email.periods import IST
from features.email.service import EmailService

logger = logging.getLogger(__name__)


async def run_email_ticker(app: FastAPI, client: Client) -> None:
    """Poll IST clock; fire weekly on Monday 08:00 and monthly on the 1st 08:00."""
    tz = ZoneInfo(IST)
    while True:
        await asyncio.sleep(30)
        now = datetime.now(tz)
        if now.hour != 8 or now.minute > 4:
            continue
        settings = get_settings()
        service = EmailService(client, settings)
        try:
            if now.weekday() == 0:
                sent = await asyncio.to_thread(service.run_digest, "weekly", now=now)
                logger.info("weekly digest ticker sent=%s", sent)
            if now.day == 1:
                sent = await asyncio.to_thread(service.run_digest, "monthly", now=now)
                logger.info("monthly digest ticker sent=%s", sent)
        except Exception:
            logger.exception("email ticker failed")
