from __future__ import annotations

import logging
from datetime import datetime
from typing import Literal

from supabase import Client

from core.config import Settings
from features.email.brevo import BrevoClient
from features.email.digest_payload import build_digest_payload
from features.email.html import render_digest_html, render_unsubscribed_html, render_welcome_html
from features.email.periods import IST, previous_month_period, previous_week_bounds_iso
from features.email.postcard_storage import postcard_asset_base
from features.email.quotes import QuotePage
from features.email.sends_repository import EmailSendsRepository
from features.email.tokens import (
    UnsubscribeSecretError,
    sign_unsubscribe_token,
    unsubscribe_url,
    verify_unsubscribe_token,
)
from features.user_settings.repository import UserSettingsRepository
from features.user_settings.schemas import UserSettingsPatchBody
from features.user_settings.service import UserSettingsService

logger = logging.getLogger(__name__)

DigestKind = Literal["weekly", "monthly"]


def _display_name(username: str | None, email: str) -> str:
    if username and username.strip():
        return username.strip()
    local = email.split("@", 1)[0].strip()
    return local or "there"


def _unsub_urls(settings: Settings, user_id: str) -> tuple[str, str]:
    secret = settings.email_unsubscribe_secret
    weekly = unsubscribe_url(
        public_base=settings.email_public_base_url,
        token=sign_unsubscribe_token(secret=secret, user_id=user_id, kind="weekly"),
    )
    monthly = unsubscribe_url(
        public_base=settings.email_public_base_url,
        token=sign_unsubscribe_token(secret=secret, user_id=user_id, kind="monthly"),
    )
    return weekly, monthly


def _asset_base(settings: Settings) -> str:
    return postcard_asset_base(settings)


class EmailService:
    def __init__(self, supabase: Client, settings: Settings) -> None:
        self._db = supabase
        self._settings = settings
        self._sends = EmailSendsRepository(supabase)
        self._brevo = BrevoClient(settings.brevo_api_key, settings.email_from)

    def send_welcome(self, *, user_id: str, email: str, username: str | None) -> None:
        if not email.strip():
            return
        if not self._brevo.enabled:
            logger.debug("welcome skipped: BREVO_API_KEY missing")
            return
        if not self._settings.email_unsubscribe_secret:
            logger.warning("welcome skipped: EMAIL_UNSUBSCRIBE_SECRET missing")
            return
        if not self._sends.try_begin(user_id=user_id, kind="welcome", period_key="once"):
            return
        weekly, monthly = _unsub_urls(self._settings, user_id)
        quote_text, quote_author = QuotePage.load(self._settings.favqs_api_key).pick()
        html = render_welcome_html(
            name=_display_name(username, email),
            asset_base=_asset_base(self._settings),
            app_link=self._settings.email_app_link,
            unsubscribe_weekly=weekly,
            unsubscribe_monthly=monthly,
            quote_text=quote_text,
            quote_author=quote_author,
        )
        try:
            message_id = self._brevo.send_html(
                to_email=email,
                to_name=_display_name(username, email),
                subject="You're in. This is Dime.",
                html=html,
                list_unsubscribe_url=weekly,
            )
        except Exception:
            logger.exception("welcome send failed user=%s", user_id)
            self._sends.delete_pending(user_id=user_id, kind="welcome", period_key="once")
            return
        self._sends.mark_sent(
            user_id=user_id, kind="welcome", period_key="once", message_id=message_id
        )

    def run_digest(self, kind: DigestKind, *, now: datetime | None = None) -> int:
        if not self._brevo.enabled:
            logger.info("digest skipped: BREVO_API_KEY missing kind=%s", kind)
            return 0
        if not self._settings.email_unsubscribe_secret:
            logger.warning("digest skipped: EMAIL_UNSUBSCRIBE_SECRET missing kind=%s", kind)
            return 0
        if kind == "weekly":
            from_iso, to_iso, period_key = previous_week_bounds_iso(IST, now=now)
            end_date = datetime.fromisoformat(to_iso).date()
            budget_year, budget_month = end_date.year, end_date.month
            kicker = "THIS WEEK"
            range_label = f"{datetime.fromisoformat(from_iso).strftime('%d %b')} – {datetime.fromisoformat(to_iso).strftime('%d %b %Y')}"
            subject = "Your week in Dime"
        else:
            from_iso, to_iso, period_key, year, month = previous_month_period(IST, now=now)
            budget_year, budget_month = year, month
            kicker = "THIS MONTH"
            range_label = datetime(year, month, 1).strftime("%B %Y")
            subject = f"Your {datetime(year, month, 1).strftime('%B')} in Dime"

        sent = 0
        quotes = QuotePage.load(self._settings.favqs_api_key)
        for row in self._sends.list_settings_for_digest(kind):
            user_id = row.get("user_id")
            if not isinstance(user_id, str) or not user_id:
                continue
            try:
                if self._send_one_digest(
                    user_id=user_id,
                    kind=kind,
                    period_key=period_key,
                    from_iso=from_iso,
                    to_iso=to_iso,
                    budget_year=budget_year,
                    budget_month=budget_month,
                    kicker=kicker,
                    range_label=range_label,
                    subject=subject,
                    quotes=quotes,
                ):
                    sent += 1
            except Exception:
                logger.exception("digest failed user=%s kind=%s", user_id, kind)
        return sent

    def _send_one_digest(
        self,
        *,
        user_id: str,
        kind: DigestKind,
        period_key: str,
        from_iso: str,
        to_iso: str,
        budget_year: int,
        budget_month: int,
        kicker: str,
        range_label: str,
        subject: str,
        quotes: QuotePage,
    ) -> bool:
        email, username = self._sends.fetch_user_email_name(user_id)
        if not email:
            return False
        if not self._sends.try_begin(user_id=user_id, kind=kind, period_key=period_key):
            return False
        payload = build_digest_payload(
            self._db,
            user_id=user_id,
            from_iso=from_iso,
            to_iso=to_iso,
            budget_year=budget_year,
            budget_month=budget_month,
            tz_name=IST,
        )
        weekly, monthly = _unsub_urls(self._settings, user_id)
        display_name = _display_name(username, email)
        quote_text, quote_author = quotes.pick()
        html = render_digest_html(
            kicker=kicker,
            range_label=range_label,
            spent=payload.spent,
            income=payload.income,
            net=payload.net,
            name=display_name,
            quote_text=quote_text,
            quote_author=quote_author,
            payees=list(payload.payees),
            income_sources=list(payload.income_sources),
            categories=[
                (row.name, row.amount, row.bar_pct, row.is_custom)
                for row in payload.categories
            ],
            top_expenses=[
                (row.name, row.date_label, row.amount)
                for row in payload.top_expenses
            ],
            budget_line=payload.budget_line,
            budget_pct=payload.budget_pct,
            app_link=self._settings.email_app_link,
            unsubscribe_weekly=weekly,
            unsubscribe_monthly=monthly,
        )
        try:
            message_id = self._brevo.send_html(
                to_email=email,
                to_name=display_name,
                subject=subject,
                html=html,
                list_unsubscribe_url=weekly if kind == "weekly" else monthly,
            )
        except Exception:
            self._sends.delete_pending(user_id=user_id, kind=kind, period_key=period_key)
            raise
        self._sends.mark_sent(
            user_id=user_id, kind=kind, period_key=period_key, message_id=message_id
        )
        return True

    def unsubscribe(self, token: str) -> tuple[bool, str]:
        try:
            parsed = verify_unsubscribe_token(
                secret=self._settings.email_unsubscribe_secret,
                token=token,
            )
        except UnsubscribeSecretError:
            logger.error("unsubscribe rejected: EMAIL_UNSUBSCRIBE_SECRET missing")
            return False, ""
        if parsed is None:
            return False, ""
        user_id, kind = parsed
        settings = UserSettingsService(UserSettingsRepository(self._db))
        if kind == "weekly":
            settings.patch(user_id, UserSettingsPatchBody(weekly_email_enabled=False))
        else:
            settings.patch(user_id, UserSettingsPatchBody(monthly_email_enabled=False))
        return True, kind


def unsubscribe_page_html(kind: str) -> str:
    return render_unsubscribed_html(kind=kind)
