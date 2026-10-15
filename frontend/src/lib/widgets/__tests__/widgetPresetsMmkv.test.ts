import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { getHideWidgetAmounts, setHideWidgetAmounts } from "../widgetPreferences";
import {
  canUndoWidgetAction,
  clearWidgetPresetData,
  MAX_WIDGET_PRESETS,
  readWidgetLastAction,
  readWidgetOutbox,
  readWidgetPresets,
  writeWidgetLastAction,
  writeWidgetOutbox,
  writeWidgetPresets,
  type WidgetLastAction,
} from "../widgetPresetsMmkv";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const CHAI = { label: "Chai", amount: 20, categoryId: "c1" };

describe("widget presets MMKV", () => {
  beforeEach(resetMockMmkv);

  it("round-trips presets for the signed-in user only, capped at three", () => {
    writeWidgetPresets("user-a", [CHAI, CHAI, CHAI, CHAI]);
    expect(readWidgetPresets("user-a")).toHaveLength(MAX_WIDGET_PRESETS);
    expect(readWidgetPresets("user-b")).toEqual([]);
    expect(readWidgetPresets(undefined)).toEqual([]);
  });

  it("ignores stored presets that are malformed", () => {
    writeWidgetPresets("user-a", [CHAI, { label: "x", amount: -1, categoryId: "c" }, {} as never]);
    expect(readWidgetPresets("user-a")).toEqual([CHAI]);
  });

  it("is wiped on sign-out together with the outbox and the last action", () => {
    writeWidgetPresets("user-a", [CHAI]);
    writeWidgetOutbox([
      { key: "k", userId: "user-a", body: {} as never, label: "Chai", amount: 20, createdAt: 1 },
    ]);
    writeWidgetLastAction({
      kind: "queued",
      userId: "user-a",
      label: "Chai",
      amount: 20,
      at: 1,
      createdAt: 1,
    });
    clearWidgetPresetData();
    expect(readWidgetPresets("user-a")).toEqual([]);
    expect(readWidgetOutbox()).toEqual([]);
    expect(readWidgetLastAction()).toBeNull();
  });
});

describe("hide amounts preference", () => {
  beforeEach(resetMockMmkv);

  it("is off by default and round-trips", () => {
    expect(getHideWidgetAmounts()).toBe(false);
    setHideWidgetAmounts(true);
    expect(getHideWidgetAmounts()).toBe(true);
    setHideWidgetAmounts(false);
    expect(getHideWidgetAmounts()).toBe(false);
  });
});

describe("canUndoWidgetAction", () => {
  const NOW = 1_000_000;
  const base: WidgetLastAction = {
    kind: "added",
    userId: "user-a",
    label: "Chai",
    amount: 20,
    at: NOW,
    createdAt: NOW,
    id: "tx",
  };

  it("allows added-with-id and queued within two minutes", () => {
    expect(canUndoWidgetAction(base, NOW + 119_000)).toBe(true);
    expect(canUndoWidgetAction({ ...base, kind: "queued", id: undefined }, NOW)).toBe(true);
  });

  it("counts the window from the tap, not from when the status was last set", () => {
    expect(canUndoWidgetAction({ ...base, at: NOW + 200_000 }, NOW + 121_000)).toBe(false);
    expect(canUndoWidgetAction({ ...base, at: NOW - 200_000 }, NOW + 60_000)).toBe(true);
  });

  it("offers nothing for a duplicate or an undo in progress", () => {
    expect(canUndoWidgetAction({ ...base, kind: "duplicate" }, NOW)).toBe(false);
    expect(canUndoWidgetAction({ ...base, kind: "undoing" }, NOW)).toBe(false);
  });

  it("refuses after two minutes, without an id, and for other states", () => {
    expect(canUndoWidgetAction(base, NOW + 121_000)).toBe(false);
    expect(canUndoWidgetAction({ ...base, id: undefined }, NOW)).toBe(false);
    expect(canUndoWidgetAction({ ...base, kind: "failed" }, NOW)).toBe(false);
    expect(canUndoWidgetAction({ ...base, kind: "undone" }, NOW)).toBe(false);
    expect(canUndoWidgetAction(null, NOW)).toBe(false);
  });
});
