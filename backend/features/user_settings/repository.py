from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from supabase import Client

_SELECT = (
    "budget_alerts_enabled,"
    "budget_monthly_alerts_enabled,"
    "budget_daily_alerts_enabled,"
    "budget_category_alerts_enabled,"
    "budget_monthly_warn_pct,"
    "budget_daily_warn_pct,"
    "budget_category_warn_pct,"
    "auto_capture_alerts_enabled,"
    "capture_failed_alerts_enabled,"
    "device_notifications_enabled,"
    "daily_expense_reminder_enabled,"
    "daily_expense_reminder_time"
)

_DEFAULTS: dict[str, Any] = {
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
}


class UserSettingsRepository:
    _SELECT = _SELECT

    def __init__(self, supabase: Client) -> None:
        self._db = supabase

    def fetch_by_user_id(self, user_id: str) -> dict[str, Any] | None:
        res = (
            self._db.table("user_settings")
            .select(self._SELECT)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        data = res.data if res is not None else None
        return data if isinstance(data, dict) else None

    def insert_defaults(self, user_id: str) -> dict[str, Any]:
        row = {"user_id": user_id, **_DEFAULTS}
        res = self._db.table("user_settings").insert(row).execute()
        data = res.data[0] if res.data else row
        return data if isinstance(data, dict) else row

    def update(self, user_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        patch_with_ts = {
            **patch,
            "updated_at": datetime.now(UTC).isoformat(),
        }
        # postgrest-py sync: after update().eq() there is no .select(); representation
        # is returned from execute() (same pattern as categories/transactions).
        res = (
            self._db.table("user_settings")
            .update(patch_with_ts)
            .eq("user_id", user_id)
            .execute()
        )
        data = res.data
        if isinstance(data, list) and data and isinstance(data[0], dict):
            return data[0]
        row = self.fetch_by_user_id(user_id)
        if row is None:
            raise RuntimeError("user_settings update returned no row")
        return row
