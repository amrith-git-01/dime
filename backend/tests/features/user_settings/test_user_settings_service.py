from __future__ import annotations

from unittest.mock import MagicMock

from features.user_settings.schemas import UserSettingsPatchBody
from features.user_settings.service import UserSettingsService


def _full_row(**overrides: object) -> dict[str, object]:
    row: dict[str, object] = {
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
    }
    row.update(overrides)
    return row


def test_get_or_create_returns_defaults_when_missing() -> None:
    repo = MagicMock()
    repo.fetch_by_user_id.return_value = None
    repo.insert_defaults.return_value = _full_row()
    service = UserSettingsService(repo)

    result = service.get_or_create("user-1")

    repo.insert_defaults.assert_called_once_with("user-1")
    assert result.budget_alerts_enabled is True
    assert result.budget_monthly_warn_pct == 80
    assert result.auto_capture_alerts_enabled is True
    assert result.capture_failed_alerts_enabled is True
    assert result.device_notifications_enabled is True


def test_patch_updates_only_provided_fields() -> None:
    repo = MagicMock()
    repo.fetch_by_user_id.return_value = _full_row()
    repo.update.return_value = _full_row(
        budget_alerts_enabled=False,
        budget_monthly_warn_pct=70,
    )
    service = UserSettingsService(repo)

    result = service.patch(
        "user-1",
        UserSettingsPatchBody(
            budget_alerts_enabled=False,
            budget_monthly_warn_pct=70,
        ),
    )

    repo.update.assert_called_once()
    assert result.budget_alerts_enabled is False
    assert result.budget_monthly_warn_pct == 70


def test_patch_updates_device_notifications_enabled() -> None:
    repo = MagicMock()
    repo.fetch_by_user_id.return_value = _full_row()
    repo.update.return_value = _full_row(device_notifications_enabled=False)
    service = UserSettingsService(repo)

    result = service.patch(
        "user-1",
        UserSettingsPatchBody(
            device_notifications_enabled=False,
        ),
    )

    repo.update.assert_called_once()
    args, kwargs = repo.update.call_args
    patch_arg = args[1] if len(args) > 1 else kwargs.get("patch")
    assert isinstance(patch_arg, dict)
    assert patch_arg["device_notifications_enabled"] is False
    assert result.device_notifications_enabled is False
