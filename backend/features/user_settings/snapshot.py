from __future__ import annotations

from dataclasses import dataclass


def _clamp_warn_pct(value: object, default: int = 80) -> int:
    try:
        pct = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return max(50, min(95, pct))


@dataclass(frozen=True)
class UserSettingsSnapshot:
    budget_alerts_enabled: bool = True
    budget_monthly_alerts_enabled: bool = True
    budget_daily_alerts_enabled: bool = True
    budget_category_alerts_enabled: bool = True
    budget_monthly_warn_pct: int = 80
    budget_daily_warn_pct: int = 80
    budget_category_warn_pct: int = 80
    auto_capture_alerts_enabled: bool = True
    capture_failed_alerts_enabled: bool = True
    device_notifications_enabled: bool = True
    daily_expense_reminder_enabled: bool = True
    daily_expense_reminder_time: str = "20:00"
    weekly_email_enabled: bool = True
    monthly_email_enabled: bool = True

    @classmethod
    def from_row(cls, row: dict[str, object] | None) -> UserSettingsSnapshot:
        if not row:
            return cls()
        return cls(
            budget_alerts_enabled=bool(row.get("budget_alerts_enabled", True)),
            budget_monthly_alerts_enabled=bool(
                row.get("budget_monthly_alerts_enabled", True)
            ),
            budget_daily_alerts_enabled=bool(
                row.get("budget_daily_alerts_enabled", True)
            ),
            budget_category_alerts_enabled=bool(
                row.get("budget_category_alerts_enabled", True)
            ),
            budget_monthly_warn_pct=_clamp_warn_pct(
                row.get("budget_monthly_warn_pct", 80)
            ),
            budget_daily_warn_pct=_clamp_warn_pct(
                row.get("budget_daily_warn_pct", 80)
            ),
            budget_category_warn_pct=_clamp_warn_pct(
                row.get("budget_category_warn_pct", 80)
            ),
            auto_capture_alerts_enabled=bool(
                row.get("auto_capture_alerts_enabled", True)
            ),
            capture_failed_alerts_enabled=bool(
                row.get("capture_failed_alerts_enabled", True)
            ),
            device_notifications_enabled=bool(
                row.get("device_notifications_enabled", True)
            ),
            daily_expense_reminder_enabled=bool(
                row.get("daily_expense_reminder_enabled", True)
            ),
            daily_expense_reminder_time=str(
                row.get("daily_expense_reminder_time", "20:00")
            ),
            weekly_email_enabled=bool(row.get("weekly_email_enabled", True)),
            monthly_email_enabled=bool(row.get("monthly_email_enabled", True)),
        )
