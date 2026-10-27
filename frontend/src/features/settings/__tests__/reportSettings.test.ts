import { mapDto, mapPatchToDto } from "../api/settingsApi";
import {
  applyUserSettingsPatch,
  DEFAULT_USER_SETTINGS,
  normalizeUserSettings,
  REPORT_ROAST_LEVELS,
} from "../types";
import { buildSettingsPatch, settingsEqual } from "../utils/settingsDraft";

jest.mock("@/lib/api/dimeApi", () => ({ dimeApi: { get: jest.fn(), patch: jest.fn() } }));

const dto = {
  budget_alerts_enabled: true,
  budget_monthly_alerts_enabled: true,
  budget_category_alerts_enabled: true,
  budget_monthly_warn_pct: 80,
  budget_category_warn_pct: 80,
  auto_capture_alerts_enabled: true,
  capture_failed_alerts_enabled: true,
  device_notifications_enabled: true,
  daily_expense_reminder_enabled: true,
  daily_expense_reminder_time: "20:00",
};

describe("report settings", () => {
  it("defaults to alerts on and a spicy tone", () => {
    expect(DEFAULT_USER_SETTINGS.reportAlertsEnabled).toBe(true);
    expect(DEFAULT_USER_SETTINGS.reportRoastLevel).toBe("spicy");
    expect(REPORT_ROAST_LEVELS).toEqual(["gentle", "spicy", "savage"]);
  });

  it("reads the fields from the server", () => {
    const settings = mapDto({
      ...dto,
      report_alerts_enabled: false,
      report_roast_level: "savage",
    });
    expect(settings.reportAlertsEnabled).toBe(false);
    expect(settings.reportRoastLevel).toBe("savage");
  });

  it("an older server without the fields reads as the defaults", () => {
    const settings = mapDto(dto);
    expect(settings.reportAlertsEnabled).toBe(true);
    expect(settings.reportRoastLevel).toBe("spicy");
  });

  it("an invalid level reads as spicy", () => {
    expect(mapDto({ ...dto, report_roast_level: "nuclear" }).reportRoastLevel).toBe(
      "spicy",
    );
    expect(
      normalizeUserSettings({ reportRoastLevel: "nuclear" as never })
        .reportRoastLevel,
    ).toBe("spicy");
  });

  it("normalizes a cached snapshot from before the fields existed", () => {
    const { reportAlertsEnabled: _a, reportRoastLevel: _l, ...old } =
      DEFAULT_USER_SETTINGS;
    const settings = normalizeUserSettings(old);
    expect(settings.reportAlertsEnabled).toBe(true);
    expect(settings.reportRoastLevel).toBe("spicy");
    expect(
      normalizeUserSettings({ reportAlertsEnabled: false }).reportAlertsEnabled,
    ).toBe(false);
  });

  it("sends only the report fields that changed", () => {
    expect(mapPatchToDto({ reportAlertsEnabled: false })).toEqual({
      report_alerts_enabled: false,
    });
    expect(mapPatchToDto({ reportRoastLevel: "gentle" })).toEqual({
      report_roast_level: "gentle",
    });
  });

  it("tracks the fields in the draft helpers", () => {
    const saved = DEFAULT_USER_SETTINGS;
    expect(settingsEqual(saved, { ...saved })).toBe(true);
    expect(settingsEqual(saved, { ...saved, reportAlertsEnabled: false })).toBe(
      false,
    );
    expect(settingsEqual(saved, { ...saved, reportRoastLevel: "savage" })).toBe(
      false,
    );
    expect(
      buildSettingsPatch(saved, {
        ...saved,
        reportAlertsEnabled: false,
        reportRoastLevel: "gentle",
      }),
    ).toEqual({ reportAlertsEnabled: false, reportRoastLevel: "gentle" });
    expect(buildSettingsPatch(saved, { ...saved })).toBeNull();
  });

  it("applies a report patch optimistically", () => {
    expect(
      applyUserSettingsPatch(DEFAULT_USER_SETTINGS, { reportRoastLevel: "savage" })
        .reportRoastLevel,
    ).toBe("savage");
  });
});
