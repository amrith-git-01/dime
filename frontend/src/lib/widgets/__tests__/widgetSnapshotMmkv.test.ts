import { createMMKV, resetMockMmkv } from "@/test-utils/mockMmkv";

import {
  clearWidgetSnapshot,
  readWidgetSnapshot,
  WIDGET_SNAPSHOT_MMKV_KEY,
  writeWidgetSnapshot,
  type WidgetSnapshot,
} from "../widgetSnapshotMmkv";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const SNAPSHOT: Omit<WidgetSnapshot, "version"> = {
  userId: "user-a",
  updatedAt: 1,
  monthKey: "2026-10",
  spentThisMonth: 100,
  recurringSpent: 0,
  flexibleSpent: 100,
  monthlyBudget: 500,
  budgetLeft: 400,
  topCategories: [],
};

/** The schema version a fresh write is stamped with. */
function readWidgetSnapshotVersion(): number {
  writeWidgetSnapshot(SNAPSHOT);
  return readWidgetSnapshot()!.version;
}

describe("widget snapshot MMKV", () => {
  beforeEach(resetMockMmkv);

  it("round-trips a snapshot", () => {
    expect(writeWidgetSnapshot(SNAPSHOT)).toBe(true);
    expect(readWidgetSnapshot()).toMatchObject(SNAPSHOT);
  });

  it("reports an identical rewrite as unchanged", () => {
    writeWidgetSnapshot(SNAPSHOT);
    expect(writeWidgetSnapshot(SNAPSHOT)).toBe(false);
    expect(writeWidgetSnapshot({ ...SNAPSHOT, spentThisMonth: 101 })).toBe(true);
  });

  it("drops a snapshot written by another schema version", () => {
    writeWidgetSnapshot(SNAPSHOT);
    const store = createMMKV({ id: "widget-snapshot" });
    store.set(
      WIDGET_SNAPSHOT_MMKV_KEY,
      JSON.stringify({ ...SNAPSHOT, version: -1 }),
    );
    expect(readWidgetSnapshot()).toBeNull();
    expect(store.contains(WIDGET_SNAPSHOT_MMKV_KEY)).toBe(false);
  });

  it("still reads a snapshot written by the 1.1.0 widgets (extra fields are ignored)", () => {
    createMMKV({ id: "widget-snapshot" }).set(
      WIDGET_SNAPSHOT_MMKV_KEY,
      JSON.stringify({
        ...SNAPSHOT,
        dayKey: "2026-10-15",
        spentToday: 10,
        recentTransactions: [],
        recurring: [],
        version: readWidgetSnapshotVersion(),
      }),
    );
    expect(readWidgetSnapshot()).toMatchObject(SNAPSHOT);
  });

  it("ignores garbage", () => {
    createMMKV({ id: "widget-snapshot" }).set(WIDGET_SNAPSHOT_MMKV_KEY, "{nope");
    expect(readWidgetSnapshot()).toBeNull();
  });

  it("clears", () => {
    writeWidgetSnapshot(SNAPSHOT);
    clearWidgetSnapshot();
    expect(readWidgetSnapshot()).toBeNull();
  });
});
