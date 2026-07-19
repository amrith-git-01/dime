from pydantic import BaseModel, ConfigDict, Field


class UserSettingsResponse(BaseModel):
    budget_alerts_enabled: bool
    budget_monthly_alerts_enabled: bool
    budget_daily_alerts_enabled: bool
    budget_category_alerts_enabled: bool
    budget_monthly_warn_pct: int
    budget_daily_warn_pct: int
    budget_category_warn_pct: int
    auto_capture_alerts_enabled: bool
    capture_failed_alerts_enabled: bool
    device_notifications_enabled: bool = True


class UserSettingsPatchBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    budget_alerts_enabled: bool | None = None
    budget_monthly_alerts_enabled: bool | None = None
    budget_daily_alerts_enabled: bool | None = None
    budget_category_alerts_enabled: bool | None = None
    budget_monthly_warn_pct: int | None = Field(default=None, ge=50, le=95)
    budget_daily_warn_pct: int | None = Field(default=None, ge=50, le=95)
    budget_category_warn_pct: int | None = Field(default=None, ge=50, le=95)
    auto_capture_alerts_enabled: bool | None = None
    capture_failed_alerts_enabled: bool | None = None
    device_notifications_enabled: bool | None = None
