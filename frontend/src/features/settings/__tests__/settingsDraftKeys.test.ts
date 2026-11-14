import {
  BUDGET_ALERT_KEYS,
  DEVICE_NOTIFICATION_KEYS,
  REMINDER_SETTINGS_KEYS,
  REPORT_SETTINGS_KEYS,
} from "../constants/settingsSlices";
import { DEFAULT_USER_SETTINGS } from "../types";
import {
  buildSettingsPatch,
  SETTINGS_DRAFT_FIELDS,
  settingsEqual,
} from "../utils/settingsDraft";

const saved = DEFAULT_USER_SETTINGS;

describe("settings draft helpers limited to some keys", () => {
  it("settingsEqual ignores differences outside the keys", () => {
    const draft = { ...saved, reminderTime: "10:00", reportRoastLevel: "savage" as const };
    expect(settingsEqual(saved, draft)).toBe(false);
    expect(settingsEqual(saved, draft, REPORT_SETTINGS_KEYS)).toBe(false);
    expect(settingsEqual(saved, draft, BUDGET_ALERT_KEYS)).toBe(true);
    expect(settingsEqual(saved, { ...saved, reminderTime: "10:00" }, REPORT_SETTINGS_KEYS)).toBe(true);
  });

  it("buildSettingsPatch carries only the keys' changes", () => {
    const draft = { ...saved, reminderTime: "10:00", reportRoastLevel: "savage" as const };
    expect(buildSettingsPatch(saved, draft, REPORT_SETTINGS_KEYS)).toEqual({ reportRoastLevel: "savage" });
    expect(buildSettingsPatch(saved, draft, REMINDER_SETTINGS_KEYS)).toEqual({ reminderTime: "10:00" });
    expect(buildSettingsPatch(saved, draft, BUDGET_ALERT_KEYS)).toBeNull();
  });

  it("compares a lead-day list by value, in order, within the keys", () => {
    expect(
      settingsEqual(saved, { ...saved, reminderDefaultLeadDays: [3, 1, 0] }, REMINDER_SETTINGS_KEYS),
    ).toBe(true);
    expect(
      buildSettingsPatch(saved, { ...saved, reminderDefaultLeadDays: [0, 1, 3] }, REMINDER_SETTINGS_KEYS),
    ).toEqual({ reminderDefaultLeadDays: [0, 1, 3] });
  });

  it("an empty key list compares nothing", () => {
    expect(settingsEqual(saved, { ...saved, reminderTime: "10:00" }, [])).toBe(true);
    expect(buildSettingsPatch(saved, { ...saved, reminderTime: "10:00" }, [])).toBeNull();
  });

  it("without keys it still covers every editable setting (and not the timezone or layouts)", () => {
    for (const key of SETTINGS_DRAFT_FIELDS) {
      expect(key).not.toBe("timezone");
      expect(key).not.toBe("cardLayouts");
    }
    expect(SETTINGS_DRAFT_FIELDS).toHaveLength(22);
  });
});

describe("settings slices", () => {
  it("cover every editable setting exactly once, plus the email pair (its own screen)", () => {
    const sliced = [
      ...DEVICE_NOTIFICATION_KEYS,
      ...BUDGET_ALERT_KEYS,
      ...REMINDER_SETTINGS_KEYS,
      ...REPORT_SETTINGS_KEYS,
      "weeklyEmailEnabled",
      "monthlyEmailEnabled",
    ];
    expect(new Set(sliced).size).toBe(sliced.length);
    expect([...sliced].sort()).toEqual([...SETTINGS_DRAFT_FIELDS].sort());
  });
});
