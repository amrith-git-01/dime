import { Appearance } from "react-native";

import { clearPersistedUserSettings } from "@/lib/settings/userSettingsMmkv";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { setApplicationNightMode } from "../../../modules/dime-system";

import {
  applyAppearanceOverride,
  getThemePreference,
  resolveScheme,
  setThemePreference,
  THEME_MODE_KEY,
} from "../themePreference";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("../../../modules/dime-system", () => ({ setApplicationNightMode: jest.fn() }));

describe("theme preference storage", () => {
  beforeEach(resetMockMmkv);

  it("defaults to system", () => {
    expect(getThemePreference()).toBe("system");
  });

  it("round-trips each preference", () => {
    for (const preference of ["light", "dark", "system"] as const) {
      setThemePreference(preference);
      expect(getThemePreference()).toBe(preference);
    }
  });

  it("falls back to system for an unknown stored value", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createMMKV } = require("react-native-mmkv");
    createMMKV({ id: "dime-settings" }).set(THEME_MODE_KEY, "sepia");
    expect(getThemePreference()).toBe("system");
  });

  it("survives clearing the signed-in user's cached settings", () => {
    setThemePreference("dark");
    clearPersistedUserSettings();
    expect(getThemePreference()).toBe("dark");
  });
});

describe("resolveScheme", () => {
  it("lets a forced preference win over the system scheme", () => {
    expect(resolveScheme("dark", "light")).toBe("dark");
    expect(resolveScheme("light", "dark")).toBe("light");
  });

  it("follows the system scheme, defaulting to light when unknown", () => {
    expect(resolveScheme("system", "dark")).toBe("dark");
    expect(resolveScheme("system", "light")).toBe("light");
    expect(resolveScheme("system", null)).toBe("light");
    expect(resolveScheme("system", undefined)).toBe("light");
  });
});

describe("applyAppearanceOverride", () => {
  it("hands control back to the OS for system and forces otherwise", () => {
    const spy = jest.spyOn(Appearance, "setColorScheme").mockImplementation();
    applyAppearanceOverride("system");
    applyAppearanceOverride("dark");
    applyAppearanceOverride("light");
    expect(spy.mock.calls).toEqual([[null], ["dark"], ["light"]]);
    spy.mockRestore();
  });

  it("also hands the choice to Android, which keeps it for the system splash screen", () => {
    jest.spyOn(Appearance, "setColorScheme").mockImplementation();
    jest.mocked(setApplicationNightMode).mockClear();
    applyAppearanceOverride("dark");
    applyAppearanceOverride("system");
    expect(jest.mocked(setApplicationNightMode).mock.calls).toEqual([["dark"], ["system"]]);
  });
});
