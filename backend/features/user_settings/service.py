from __future__ import annotations

from typing import Any

from features.user_settings.repository import UserSettingsRepository
from features.user_settings.schemas import UserSettingsPatchBody, UserSettingsResponse
from features.user_settings.snapshot import UserSettingsSnapshot


class UserSettingsService:
    def __init__(self, repo: UserSettingsRepository) -> None:
        self._repo = repo

    def get_or_create(self, user_id: str) -> UserSettingsResponse:
        row = self._repo.fetch_by_user_id(user_id)
        if row is None:
            row = self._repo.insert_defaults(user_id)
        return self._to_response(row)

    def patch(self, user_id: str, body: UserSettingsPatchBody) -> UserSettingsResponse:
        row = self._repo.fetch_by_user_id(user_id)
        if row is None:
            row = self._repo.insert_defaults(user_id)

        patch_fields: dict[str, Any] = {}
        mapping = (
            ("budget_alerts_enabled", body.budget_alerts_enabled),
            ("budget_monthly_alerts_enabled", body.budget_monthly_alerts_enabled),
            ("budget_daily_alerts_enabled", body.budget_daily_alerts_enabled),
            ("budget_category_alerts_enabled", body.budget_category_alerts_enabled),
            ("budget_monthly_warn_pct", body.budget_monthly_warn_pct),
            ("budget_daily_warn_pct", body.budget_daily_warn_pct),
            ("budget_category_warn_pct", body.budget_category_warn_pct),
            ("auto_capture_alerts_enabled", body.auto_capture_alerts_enabled),
            ("capture_failed_alerts_enabled", body.capture_failed_alerts_enabled),
            ("device_notifications_enabled", body.device_notifications_enabled),
            ("daily_expense_reminder_enabled", body.daily_expense_reminder_enabled),
            ("daily_expense_reminder_time", body.daily_expense_reminder_time),
            ("weekly_email_enabled", body.weekly_email_enabled),
            ("monthly_email_enabled", body.monthly_email_enabled),
        )
        for key, value in mapping:
            if value is not None:
                patch_fields[key] = value

        if patch_fields:
            row = self._repo.update(user_id, patch_fields)
        return self._to_response(row)

    def get_snapshot(self, user_id: str) -> UserSettingsSnapshot:
        row = self._repo.fetch_by_user_id(user_id)
        if row is None:
            return UserSettingsSnapshot()
        return UserSettingsSnapshot.from_row(row)

    @staticmethod
    def _to_response(row: dict[str, object]) -> UserSettingsResponse:
        snap = UserSettingsSnapshot.from_row(row)
        return UserSettingsResponse(
            budget_alerts_enabled=snap.budget_alerts_enabled,
            budget_monthly_alerts_enabled=snap.budget_monthly_alerts_enabled,
            budget_daily_alerts_enabled=snap.budget_daily_alerts_enabled,
            budget_category_alerts_enabled=snap.budget_category_alerts_enabled,
            budget_monthly_warn_pct=snap.budget_monthly_warn_pct,
            budget_daily_warn_pct=snap.budget_daily_warn_pct,
            budget_category_warn_pct=snap.budget_category_warn_pct,
            auto_capture_alerts_enabled=snap.auto_capture_alerts_enabled,
            capture_failed_alerts_enabled=snap.capture_failed_alerts_enabled,
            device_notifications_enabled=snap.device_notifications_enabled,
            daily_expense_reminder_enabled=snap.daily_expense_reminder_enabled,
            daily_expense_reminder_time=snap.daily_expense_reminder_time,
            weekly_email_enabled=snap.weekly_email_enabled,
            monthly_email_enabled=snap.monthly_email_enabled,
        )
