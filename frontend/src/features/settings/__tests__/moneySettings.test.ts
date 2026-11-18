import { mapDto, mapPatchToDto } from "../api/settingsApi";
import {
  applyUserSettingsPatch,
  DEFAULT_USER_SETTINGS,
  normalizeUserSettings,
} from "../types";

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

describe("count cash withdrawals as spending", () => {
  it("is off by default: an ATM withdrawal is a transfer", () => {
    expect(DEFAULT_USER_SETTINGS.countCashWithdrawalsAsSpend).toBe(false);
    expect(normalizeUserSettings(undefined).countCashWithdrawalsAsSpend).toBe(false);
  });

  it("reads the server's value, and an older server (no field) reads as off", () => {
    expect(mapDto({ ...dto, count_cash_withdrawals_as_spend: true }).countCashWithdrawalsAsSpend).toBe(true);
    expect(mapDto({ ...dto, count_cash_withdrawals_as_spend: false }).countCashWithdrawalsAsSpend).toBe(false);
    expect(mapDto(dto).countCashWithdrawalsAsSpend).toBe(false);
  });

  it("sends the snake_case field only when it is in the patch", () => {
    expect(mapPatchToDto({ countCashWithdrawalsAsSpend: true })).toEqual({
      count_cash_withdrawals_as_spend: true,
    });
    expect(mapPatchToDto({ countCashWithdrawalsAsSpend: false })).toEqual({
      count_cash_withdrawals_as_spend: false,
    });
    expect(mapPatchToDto({ budgetMonthlyWarnPct: 70 })).not.toHaveProperty("count_cash_withdrawals_as_spend");
  });

  it("a patch applies on top of the cached settings (the optimistic save)", () => {
    const next = applyUserSettingsPatch(DEFAULT_USER_SETTINGS, { countCashWithdrawalsAsSpend: true });
    expect(next.countCashWithdrawalsAsSpend).toBe(true);
    expect(next.budgetMonthlyWarnPct).toBe(DEFAULT_USER_SETTINGS.budgetMonthlyWarnPct);
  });
});
