import { QueryClient } from "@tanstack/react-query";

import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { HomeOverview } from "@/features/transactions/types";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import {
  endTourPreview,
  isSampleDataOnScreen,
  isTourPreviewShowing,
  latchAccountEmpty,
  readHomeActivity,
  reportSampleShown,
  setTourPreviewSuspended,
  startTourPreview,
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
const RESET = {
  active: false,
  userId: undefined,
  domains: [] as never[],
  suspended: false,
  accountEmpty: null,
  shown: 0,
};

describe("tour preview store", () => {
  beforeEach(() => {
    useTourPreviewStore.setState(RESET);
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

  describe("startTourPreview", () => {
    it("latches for the user and the kinds of data the tour may show", () => {
      startTourPreview("user-a", ["transactions", "budget"]);
      expect(state()).toMatchObject({ active: true, userId: "user-a", suspended: false, shown: 0 });
      expect(state().domains).toEqual(["transactions", "budget"]);
    });

    it("does nothing for a tour with no sample data, or when nobody is signed in", () => {
      startTourPreview("user-a", []);
      expect(state().active).toBe(false);
      startTourPreview(undefined, ["transactions"]);
      expect(state().active).toBe(false);
    });

    it("a later start without sample data clears an earlier latch", () => {
      startTourPreview("user-a", ["transactions"]);
      startTourPreview("user-a", []);
      expect(state().active).toBe(false);
    });
  });

  it("endTourPreview resets the tour's state, but not the count of queries showing sample data", () => {
    startTourPreview("user-a", ["recurring"]);
    setTourPreviewSuspended(true);
    latchAccountEmpty(true);
    reportSampleShown(1);
    endTourPreview();
    expect(state()).toMatchObject({
      active: false,
      userId: undefined,
      suspended: false,
      accountEmpty: null,
      shown: 1,
    });
    expect(state().domains).toEqual([]);
  });

  it("starting a tour (Up next) keeps the mounted queries' count, so the pill does not vanish", () => {
    startTourPreview("user-a", ["transactions"]);
    reportSampleShown(1);
    reportSampleShown(1);
    endTourPreview();
    startTourPreview("user-a", ["budget"]);
    expect(state().shown).toBe(2);
    expect(isSampleDataOnScreen(state(), "user-a")).toBe(true);
  });

  describe("whether the account is empty, decided once per tour", () => {
    it("is unknown at the start and stays as first decided", () => {
      startTourPreview("user-a", ["transactions"]);
      expect(state().accountEmpty).toBeNull();
      latchAccountEmpty(false);
      latchAccountEmpty(true);
      expect(state().accountEmpty).toBe(false);
    });

    it("is decided afresh for the next tour", () => {
      startTourPreview("user-a", ["transactions"]);
      latchAccountEmpty(false);
      endTourPreview();
      startTourPreview("user-a", ["transactions"]);
      expect(state().accountEmpty).toBeNull();
    });
  });

  it("only suspends an active preview", () => {
    setTourPreviewSuspended(true);
    expect(state().suspended).toBe(false);

    startTourPreview("user-a", ["transactions"]);
    setTourPreviewSuspended(true);
    expect(state().suspended).toBe(true);
    setTourPreviewSuspended(false);
    expect(state().suspended).toBe(false);
  });

  describe("isTourPreviewShowing", () => {
    const on = {
      active: true,
      userId: "user-a",
      domains: ["transactions"] as const,
      suspended: false,
      accountEmpty: null,
      shown: 0,
    };

    it("shows only for the user it latched for, while active and not suspended", () => {
      expect(isTourPreviewShowing(on, "user-a", "transactions")).toBe(true);
      expect(isTourPreviewShowing(on, "user-b", "transactions")).toBe(false);
      expect(isTourPreviewShowing(on, undefined, "transactions")).toBe(false);
      expect(isTourPreviewShowing({ ...on, suspended: true }, "user-a", "transactions")).toBe(false);
      expect(isTourPreviewShowing({ ...on, active: false }, "user-a", "transactions")).toBe(false);
    });

    it("shows only the kinds of data the tour may show", () => {
      expect(isTourPreviewShowing(on, "user-a", "budget")).toBe(false);
      expect(isTourPreviewShowing(on, "user-a", "recurring")).toBe(false);
    });
  });

  describe("the Sample data pill", () => {
    it("follows how many previewed queries are showing sample data", () => {
      startTourPreview("user-a", ["transactions"]);
      expect(isSampleDataOnScreen(state(), "user-a")).toBe(false);
      reportSampleShown(1);
      reportSampleShown(1);
      expect(state().shown).toBe(2);
      expect(isSampleDataOnScreen(state(), "user-a")).toBe(true);
      reportSampleShown(-1);
      expect(isSampleDataOnScreen(state(), "user-a")).toBe(true);
      reportSampleShown(-1);
      expect(isSampleDataOnScreen(state(), "user-a")).toBe(false);
    });

    it("never counts below zero, and hides while the tour is hidden or for another account", () => {
      reportSampleShown(-1);
      expect(state().shown).toBe(0);
      startTourPreview("user-a", ["transactions"]);
      reportSampleShown(1);
      expect(isSampleDataOnScreen(state(), "user-b")).toBe(false);
      setTourPreviewSuspended(true);
      expect(isSampleDataOnScreen(state(), "user-a")).toBe(false);
    });
  });
});
