from datetime import datetime
from zoneinfo import ZoneInfo

from features.email.brevo import BrevoClient, parse_from_address
from features.email.html import format_inr, render_digest_html, render_welcome_html
from features.email.periods import previous_month_period, previous_week_bounds_iso
from features.email.postcard_storage import public_postcard_base
from features.email.tokens import sign_unsubscribe_token, verify_unsubscribe_token
from features.user_settings.schemas import UserSettingsPatchBody
from features.user_settings.service import UserSettingsService


def test_previous_week_is_last_complete_mon_sun() -> None:
    now = datetime(2026, 8, 17, 8, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
    start, end, key = previous_week_bounds_iso(now=now)
    assert key == "2026-W33"
    assert "2026-08-10" in start
    assert "2026-08-16" in end


def test_previous_month_period_key() -> None:
    now = datetime(2026, 9, 1, 8, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
    _start, _end, key, year, month = previous_month_period(now=now)
    assert key == "2026-08"
    assert year == 2026
    assert month == 8


def test_unsubscribe_token_roundtrip() -> None:
    token = sign_unsubscribe_token(
        secret="s", user_id="user-1", kind="weekly", now_ts=1_700_000_000
    )
    parsed = verify_unsubscribe_token(
        secret="s", token=token, now_ts=1_700_000_000 + 60
    )
    assert parsed == ("user-1", "weekly")
    assert verify_unsubscribe_token(secret="other", token=token, now_ts=1_700_000_000) is None


def test_brevo_noop_without_key() -> None:
    client = BrevoClient(None, "Dime <hello@example.com>")
    assert client.enabled is False
    assert (
        client.send_html(
            to_email="a@b.com",
            to_name="A",
            subject="Hi",
            html="<p>x</p>",
        )
        is None
    )


def test_parse_from_address() -> None:
    assert parse_from_address("Dime <hello@x.com>") == ("Dime", "hello@x.com")
    assert parse_from_address("hello@x.com") == ("Dime", "hello@x.com")


def test_public_postcard_base_uses_supabase_storage() -> None:
    assert (
        public_postcard_base(
            supabase_url="https://abc.supabase.co/",
            bucket="Dime",
        )
        == "https://abc.supabase.co/storage/v1/object/public/Dime/email"
    )
    assert (
        public_postcard_base(
            supabase_url="https://abc.supabase.co",
            bucket="Dime",
            override="https://cdn.example.com/mail/",
        )
        == "https://cdn.example.com/mail"
    )


def test_welcome_html_contains_tour_copy() -> None:
    html = render_welcome_html(
        name="Amrith",
        asset_base="http://localhost:8000/static/email",
        app_link="https://example.com",
        unsubscribe_weekly="http://localhost/u/w",
        unsubscribe_monthly="http://localhost/u/m",
        quote_text="Keep rupees close.",
        quote_author="Ada",
    )
    assert "Amrith" in html
    assert "You" in html
    assert "01 · CAPTURE" in html
    assert "slide-1.png" in html
    assert "#2B3FE0" in html
    assert "Keep rupees close." in html
    assert "Ada" in html
    assert "Henry David Thoreau" not in html
    assert html.index("Keep rupees close.") < html.index("01 · CAPTURE")
    assert html.count("Keep rupees close.") == 1
    assert "WHAT WE" not in html
    assert "Turn off weekly" not in html
    assert "You’re getting this" not in html


def test_digest_html_empty_defaults() -> None:
    html = render_digest_html(
        kicker="THIS WEEK",
        range_label="10–16 Aug",
        spent="0",
        income="0",
        net="0",
        payees=[],
        income_sources=[],
        categories=[],
        top_expenses=[],
        budget_line="No budget set",
        budget_pct=None,
        app_link="https://example.com",
        unsubscribe_weekly="http://localhost/u/w",
        unsubscribe_monthly="http://localhost/u/m",
        name="Amrith",
        quote_text="Keep rupees close.",
        quote_author="Ada",
    )
    assert "THIS WEEK" in html
    assert "last week, Amrith" in html
    assert "Keep rupees close." in html
    assert "Ada" in html
    assert html.index("last week, Amrith") < html.index("Keep rupees close.")
    assert html.index("Keep rupees close.") < html.index("THIS WEEK")
    assert "Spent, earned, and where it went" in html
    assert "10–16 Aug" in html
    assert "₹0" in html
    assert "No budget set" in html
    assert "Income" in html
    assert "Spent" in html
    assert "Net" in html
    assert "CATEGORIES" in html
    assert "No spending yet" in html
    assert "WHO YOU PAID" in html
    assert "WHO PAID YOU" in html
    assert "No income recorded" in html
    assert "TOP EXPENSES" in html
    assert "No expenses yet" in html
    assert "John C. Maxwell" not in html
    assert "Charles Dickens" not in html
    assert "TOP CATEGORIES" not in html
    assert "nothing logged" not in html
    assert "CASHFLOW" not in html
    assert "Turn off weekly" not in html


def test_digest_html_filled_home_cards() -> None:
    html = render_digest_html(
        kicker="THIS WEEK",
        range_label="10–16 Aug",
        spent="500",
        income="2000",
        net="1500",
        payees=[("Metro", "200", 1.0)],
        income_sources=[("Salary", "2000", 1.0)],
        categories=[
            ("Food", "300", 1.0, False),
            ("Rent", "200", 0.67, True),
        ],
        top_expenses=[("Metro", "12 Aug", "200")],
        budget_line="₹8,200 / ₹20,000",
        budget_pct=0.41,
        app_link="https://example.com",
        unsubscribe_weekly="http://localhost/u/w",
        unsubscribe_monthly="http://localhost/u/m",
        name="Amrith",
        quote_text="Keep rupees close.",
        quote_author="Ada",
    )
    assert "last week, Amrith" in html
    assert "Keep rupees close." in html
    assert "₹500" in html
    assert "#2B3FE0" in html
    assert "Income" in html
    assert "₹2,000" in html
    assert "Salary" in html
    assert "Food" in html
    assert "Rent" in html
    assert "Custom" in html
    assert "WHO YOU PAID" in html
    assert "WHO PAID YOU" in html
    assert "TOP EXPENSES" in html
    assert "12 Aug" in html
    assert "41% used" in html
    assert "75% saved" not in html
    assert "TOP CATEGORIES" not in html
    assert "CASHFLOW" not in html
    assert "John C. Maxwell" not in html


def test_digest_html_monthly_intro() -> None:
    html = render_digest_html(
        kicker="THIS MONTH",
        range_label="August 2026",
        spent="0",
        income="0",
        net="0",
        payees=[],
        income_sources=[],
        categories=[],
        top_expenses=[],
        budget_line="No budget set",
        budget_pct=None,
        app_link="https://example.com",
        unsubscribe_weekly="http://localhost/u/w",
        unsubscribe_monthly="http://localhost/u/m",
        name="Amrith",
        quote_text="Keep rupees close.",
        quote_author="Ada",
    )
    assert "August, Amrith" in html
    assert "Keep rupees close." in html
    assert "Charles Dickens" not in html


def test_format_inr() -> None:
    assert format_inr("12430") == "₹12,430"
    assert format_inr("0") == "₹0"


def test_patch_email_toggles() -> None:
    from unittest.mock import MagicMock

    repo = MagicMock()
    repo.fetch_by_user_id.return_value = {
        "budget_alerts_enabled": True,
        "budget_monthly_alerts_enabled": True,
        "budget_daily_alerts_enabled": True,
        "budget_category_alerts_enabled": True,
        "budget_monthly_warn_pct": 80,
        "budget_daily_warn_pct": 80,
        "budget_category_warn_pct": 80,
        "auto_capture_alerts_enabled": True,
        "capture_failed_alerts_enabled": True,
        "device_notifications_enabled": True,
        "daily_expense_reminder_enabled": True,
        "daily_expense_reminder_time": "20:00",
        "weekly_email_enabled": True,
        "monthly_email_enabled": True,
    }
    repo.update.return_value = {
        **repo.fetch_by_user_id.return_value,
        "weekly_email_enabled": False,
    }
    service = UserSettingsService(repo)
    result = service.patch(
        "user-1",
        UserSettingsPatchBody(weekly_email_enabled=False),
    )
    assert result.weekly_email_enabled is False
    patch_arg = repo.update.call_args[0][1]
    assert patch_arg["weekly_email_enabled"] is False
