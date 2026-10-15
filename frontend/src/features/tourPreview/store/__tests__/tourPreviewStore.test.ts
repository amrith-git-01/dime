import { QueryClient } from "@tanstack/react-query";

import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { HomeOverview } from "@/features/transactions/types";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import {
  endTourPreview,
  isTourPreviewShowing,
  readHomeActivity,
  setTourPreviewSuspended,
  startTourPreviewIfEmpty,
  useTourPreviewStore,
} from "../tourPreviewStore";

let client: QueryClient;

function seedHome(userId: string, overrides: Partial<HomeOverview> = {}): void {
  const home: HomeOverview = {
    spent_today: "0",
    spent_this_month: "0",
    top_categories: [],
    recent_transactions: [],
    ...overrides,
  };
  client.setQueryData(transactionsQueryKeys.home(userId, getDeviceIanaTimezone()), home);
}

const state = () => useTourPreviewStore.getState();

describe("tour preview store", () => {
  beforeEach(() => {
    useTourPreviewStore.setState({ active: false, userId: undefined, suspended: false });
    client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  });

  describe("readHomeActivity", () => {
    it("is unknown when the Home overview is not cached", () => {
      expect(readHomeActivity(client, "user-a")).toBe("unknown");
    });

    it("is empty with no transactions and nothing spent", () => {
      seedHome("user-a");
      expect(readHomeActivity(client, "user-a")).toBe("empty");
    });

    it("has activity once there are recent transactions or spend this month", () => {
      seedHome("user-a", { spent_this_month: "10.00" });
      expect(readHomeActivity(client, "user-a")).toBe("activity");

      seedHome("user-b", {
        recent_transactions: [{ id: "t" } as HomeOverview["recent_transactions"][number]],
      });
      expect(readHomeActivity(client, "user-b")).toBe("activity");
    });

    it("reads the given user's cache entry only", () => {
      seedHome("user-b");
      expect(readHomeActivity(client, "user-a")).toBe("unknown");
    });
  });

  describe("startTourPreviewIfEmpty", () => {
    it("latches for the user when the account is known to be empty", () => {
      seedHome("user-a");
      expect(startTourPreviewIfEmpty(client, "user-a")).toBe(true);
      expect(state()).toMatchObject({ active: true, userId: "user-a", suspended: false });
    });

    it("does not latch when the overview is unknown, has activity, or nobody is signed in", () => {
      expect(startTourPreviewIfEmpty(client, "user-a")).toBe(false);
      expect(state().active).toBe(false);

      seedHome("user-a", { spent_this_month: "5.00" });
      expect(startTourPreviewIfEmpty(client, "user-a")).toBe(false);

      seedHome("user-a");
      expect(startTourPreviewIfEmpty(client, undefined)).toBe(false);
      expect(state().active).toBe(false);
    });

    it("a later start for a non-empty account clears an earlier latch", () => {
      seedHome("user-a");
      startTourPreviewIfEmpty(client, "user-a");
      seedHome("user-b", { spent_this_month: "5.00" });
      expect(startTourPreviewIfEmpty(client, "user-b")).toBe(false);
      expect(state().active).toBe(false);
    });
  });

  it("endTourPreview resets everything", () => {
    seedHome("user-a");
    startTourPreviewIfEmpty(client, "user-a");
    setTourPreviewSuspended(true);
    endTourPreview();
    expect(state()).toMatchObject({ active: false, userId: undefined, suspended: false });
  });

  it("only suspends an active preview", () => {
    setTourPreviewSuspended(true);
    expect(state().suspended).toBe(false);

    seedHome("user-a");
    startTourPreviewIfEmpty(client, "user-a");
    setTourPreviewSuspended(true);
    expect(state().suspended).toBe(true);
    setTourPreviewSuspended(false);
    expect(state().suspended).toBe(false);
  });

  describe("isTourPreviewShowing", () => {
    const on = { active: true, userId: "user-a", suspended: false };

    it("shows only for the user it latched for, while active and not suspended", () => {
      expect(isTourPreviewShowing(on, "user-a")).toBe(true);
      expect(isTourPreviewShowing(on, "user-b")).toBe(false);
      expect(isTourPreviewShowing(on, undefined)).toBe(false);
      expect(isTourPreviewShowing({ ...on, suspended: true }, "user-a")).toBe(false);
      expect(isTourPreviewShowing({ ...on, active: false }, "user-a")).toBe(false);
    });
  });
});
