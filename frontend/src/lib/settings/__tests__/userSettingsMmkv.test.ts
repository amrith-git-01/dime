import { createMMKV } from "react-native-mmkv";

import { DEFAULT_USER_SETTINGS } from "@/features/settings/types";
import { CACHE_SCHEMA_VERSION } from "@/lib/cacheVersion";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import {
  readPersistedUserSettings,
  USER_SETTINGS_MMKV_KEY,
  writePersistedUserSettings,
} from "../userSettingsMmkv";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const settings = { ...DEFAULT_USER_SETTINGS, budgetMonthlyWarnPct: 55 };

describe("user settings MMKV snapshot", () => {
  beforeEach(resetMockMmkv);

  it("round-trips for the owning user", () => {
    writePersistedUserSettings("user-a", settings);
    expect(readPersistedUserSettings("user-a")).toEqual(settings);
  });

  it("refuses and drops a snapshot written for another user", () => {
    writePersistedUserSettings("user-a", settings);
    expect(readPersistedUserSettings("user-b")).toBeNull();
    expect(readPersistedUserSettings("user-a")).toBeNull();
  });

  it("refuses a snapshot written by another schema version", () => {
    writePersistedUserSettings("user-a", settings);
    const store = createMMKV({ id: "dime-settings" });
    const stored = JSON.parse(
      store.getString(USER_SETTINGS_MMKV_KEY) as string,
    );
    store.set(
      USER_SETTINGS_MMKV_KEY,
      JSON.stringify({ ...stored, version: CACHE_SCHEMA_VERSION + 1 }),
    );
    expect(readPersistedUserSettings("user-a")).toBeNull();
  });

  it("refuses an untagged legacy snapshot", () => {
    createMMKV({ id: "dime-settings" }).set(
      USER_SETTINGS_MMKV_KEY,
      JSON.stringify({ timestamp: Date.now(), settings }),
    );
    expect(readPersistedUserSettings("user-a")).toBeNull();
  });
});
