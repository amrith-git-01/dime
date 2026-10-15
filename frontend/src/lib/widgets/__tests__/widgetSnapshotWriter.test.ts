import { Platform } from "react-native";

import { budgetQueryKeys, categoryBudgetsQueryKeys } from "@/features/budgets/queryKeys";
import { recurringQueryKeys } from "@/features/recurring/queryKeys";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { HomeOverview } from "@/features/transactions/types";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { resetMockMmkv } from "@/test-utils/mockMmkv";
import { createTestQueryClient } from "@/test-utils/testQueryClient";
import { refreshWidgets } from "@/widgets/refreshWidgets";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import { readWidgetSnapshot } from "../widgetSnapshotMmkv";
import {
  affectsWidgetSnapshot,
  subscribeWidgetSnapshotWriter,
  syncWidgetSnapshot,
} from "../widgetSnapshotWriter";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/widgets/refreshWidgets", () => ({ refreshWidgets: jest.fn() }));
jest.mock("@/stores/authSessionStore", () => {
  const { create } = jest.requireActual("zustand");
  return {
    useAuthSessionStore: create(() => ({ session: null, userId: "user-a" })),
  };
});

const USER = "user-a";
const OVERVIEW: HomeOverview = {
  spent_today: "10.00",
  spent_this_month: "500.00",
  top_categories: [],
  recent_transactions: [],
};

function homeKey() {
  return transactionsQueryKeys.home(USER, getDeviceIanaTimezone());
}

describe("affectsWidgetSnapshot", () => {
  it("follows only the home overview and the budgets", () => {
    expect(affectsWidgetSnapshot(homeKey())).toBe(true);
    expect(affectsWidgetSnapshot(budgetQueryKeys.current(USER))).toBe(true);
    expect(affectsWidgetSnapshot(categoryBudgetsQueryKeys.list(USER))).toBe(true);
    expect(
      affectsWidgetSnapshot(transactionsQueryKeys.monthPages(USER, 2026, 10, "UTC")),
    ).toBe(false);
    expect(affectsWidgetSnapshot(["notifications", USER])).toBe(false);
    // The recurring lists feed the Upcoming widget; the month view does not.
    expect(affectsWidgetSnapshot(recurringQueryKeys.list(USER, "income"))).toBe(true);
    expect(affectsWidgetSnapshot(recurringQueryKeys.list(USER, "subscription"))).toBe(true);
    expect(affectsWidgetSnapshot(recurringQueryKeys.month(USER, 2026, 9))).toBe(false);
  });
});

describe("syncWidgetSnapshot", () => {
  beforeEach(() => {
    resetMockMmkv();
    jest.mocked(refreshWidgets).mockClear();
    useAuthSessionStore.setState({ userId: USER });
  });

  it("writes the snapshot and redraws the widgets once, then skips an unchanged rebuild", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(homeKey(), OVERVIEW);

    syncWidgetSnapshot(queryClient);
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(500);
    expect(refreshWidgets).toHaveBeenCalledTimes(1);

    syncWidgetSnapshot(queryClient);
    expect(refreshWidgets).toHaveBeenCalledTimes(1);
  });

  it("does nothing when signed out or before the overview is cached", () => {
    const queryClient = createTestQueryClient();
    syncWidgetSnapshot(queryClient);
    expect(readWidgetSnapshot()).toBeNull();

    queryClient.setQueryData(homeKey(), OVERVIEW);
    useAuthSessionStore.setState({ userId: undefined });
    syncWidgetSnapshot(queryClient);
    expect(readWidgetSnapshot()).toBeNull();
    expect(refreshWidgets).not.toHaveBeenCalled();
  });
});

describe("subscribeWidgetSnapshotWriter", () => {
  beforeEach(() => {
    resetMockMmkv();
    jest.mocked(refreshWidgets).mockClear();
    useAuthSessionStore.setState({ userId: USER });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("is inert off Android", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(homeKey(), OVERVIEW);
    subscribeWidgetSnapshotWriter(queryClient, 10)();
    jest.advanceTimersByTime(100);
    expect(readWidgetSnapshot()).toBeNull();
  });

  it("debounces a burst of successful updates into one write", () => {
    jest.replaceProperty(Platform, "OS", "android");
    const queryClient = createTestQueryClient();
    const unsubscribe = subscribeWidgetSnapshotWriter(queryClient, 500);

    queryClient.setQueryData(homeKey(), { ...OVERVIEW, spent_this_month: "100.00" });
    queryClient.setQueryData(homeKey(), { ...OVERVIEW, spent_this_month: "200.00" });
    queryClient.setQueryData(["transactions", "monthPages", USER], { pages: [] });
    jest.advanceTimersByTime(499);
    expect(readWidgetSnapshot()).toBeNull();

    jest.advanceTimersByTime(1);
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(200);
    expect(refreshWidgets).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("syncs once at start from the restored cache and stops after unsubscribe", () => {
    jest.replaceProperty(Platform, "OS", "android");
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(homeKey(), OVERVIEW);
    const unsubscribe = subscribeWidgetSnapshotWriter(queryClient, 500);
    jest.advanceTimersByTime(500);
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(500);

    unsubscribe();
    queryClient.setQueryData(homeKey(), { ...OVERVIEW, spent_this_month: "900.00" });
    jest.advanceTimersByTime(1000);
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(500);
  });
});
