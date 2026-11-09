import { createElement, type ReactElement } from "react";

import { formatInrCompact } from "@/utils/currency";

import type { TransactionRow } from "../../types";
import type { CategoryMonthView } from "../../utils/categoryMonthStats";
import { useCategoryMonthView, type CategoryMonthViewArgs } from "../useCategoryMonthView";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

type Spend = Record<string, number>;
let mockSpendByMonth: Record<string, Spend | undefined> = {};
let mockSpendPlaceholder = false;
const mockSummaryCalls: { key: string; enabled: boolean | undefined }[] = [];
let mockRowsByMonth: Record<string, Record<string, unknown>> = {};
const mockMonthRowsCalls: unknown[][] = [];
const mockSummaryRefetch = jest.fn();
jest.mock("../useTransactionsOverviewQueries", () => ({
  useMonthDebitTotalsByCategoryQuery: (
    year: number,
    monthIndex0: number,
    options?: { enabled?: boolean },
  ) => {
    const key = `${year}-${monthIndex0}`;
    mockSummaryCalls.push({ key, enabled: options?.enabled });
    const data = mockSpendByMonth[key];
    return {
      data,
      isPending: data === undefined,
      isError: false,
      isPlaceholderData: mockSpendPlaceholder,
      refetch: mockSummaryRefetch,
    };
  },
  useTransactionsMonthInfiniteQuery: (...args: unknown[]) => {
    mockMonthRowsCalls.push(args);
    return mockRowsByMonth[`${args[0]}-${args[1]}`] ?? mockRowsQuery([]);
  },
}));

const mockBudgetsRefetch = jest.fn();
let mockBudgets: { category_id: string; monthly_amount: string }[] | undefined;
jest.mock("@/features/budgets/hooks/useCategoryBudgetsQuery", () => ({
  useCategoryBudgetsQuery: () => ({
    data: mockBudgets,
    isPending: mockBudgets === undefined,
    isError: false,
    refetch: mockBudgetsRefetch,
  }),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => {
    unmount: () => void;
    update: (element: ReactElement) => void;
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

let view: CategoryMonthView | undefined;
let args: CategoryMonthViewArgs;
function Probe() {
  view = useCategoryMonthView(args);
  return null;
}
async function render(next: CategoryMonthViewArgs) {
  args = next;
  let renderer: { unmount: () => void; update: (element: ReactElement) => void } | undefined;
  await act(async () => {
    renderer = create(createElement(Probe));
  });
  return Object.assign(renderer!, {
    async rerender(again: CategoryMonthViewArgs) {
      args = again;
      await act(async () => {
        renderer!.update(createElement(Probe));
      });
    },
  });
}
const current = () => {
  if (!view) throw new Error("not rendered");
  return view;
};

const money = formatInrCompact;
const at = (year: number, monthIndex0: number, day: number, hour = 12) =>
  new Date(year, monthIndex0, day, hour);

function row(when: Date, amount: string, over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: `${when.getTime()}-${amount}`,
    type: "debit",
    category_id: "cat-1",
    amount,
    transaction_at: when.toISOString(),
    ...over,
  } as TransactionRow;
}

function mockRowsQuery(items: TransactionRow[], over: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ items, has_more: false }], pageParams: [0] },
    isPending: false,
    isError: false,
    isPlaceholderData: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
    ...over,
  };
}

const NOVEMBER = { year: 2026, monthIndex0: 10 };
const OCTOBER = { year: 2026, monthIndex0: 9 };

function baseArgs(over: Partial<CategoryMonthViewArgs> = {}): CategoryMonthViewArgs {
  return {
    categoryId: "cat-1",
    month: NOVEMBER,
    rows: [row(at(2026, 10, 8), "40.00"), row(at(2026, 10, 3), "300.00")],
    rowsHaveMore: false,
    rowsStatus: "ready",
    canSetCap: true,
    ...over,
  };
}

// Today is 8 November 2026; only the clock is faked.
beforeAll(() => {
  jest.useFakeTimers({
    now: new Date(2026, 10, 8, 12),
    doNotFake: [
      "nextTick",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "performance",
      "hrtime",
    ],
  });
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  mockSpendByMonth = { "2026-10": { "cat-1": 5958 }, "2026-9": { "cat-1": 4000 } };
  mockSpendPlaceholder = false;
  mockSummaryCalls.length = 0;
  mockMonthRowsCalls.length = 0;
  mockBudgets = [{ category_id: "cat-1", monthly_amount: "10000.00" }];
  mockRowsByMonth = {
    // This month: 300 on the 3rd, 40 today and 2000 dated later this month.
    "2026-10": mockRowsQuery([
      row(at(2026, 10, 20), "2000.00"),
      row(at(2026, 10, 8), "40.00"),
      row(at(2026, 10, 3), "300.00"),
    ]),
    "2026-9": mockRowsQuery([
      row(at(2026, 9, 2), "500.00"),
      row(at(2026, 9, 8, 22), "250.00"),
      row(at(2026, 9, 9), "999.00"),
      row(at(2026, 9, 5), "70.00", { category_id: "cat-2" }),
    ]),
  };
  mockSummaryRefetch.mockClear();
  mockBudgetsRefetch.mockClear();
  view = undefined;
});

const monthRowsCall = (key: string) =>
  mockMonthRowsCalls.find((call) => `${call[0]}-${call[1]}` === key);

describe("useCategoryMonthView", () => {
  it("compares days 1..today of both months, while the hero keeps the whole month", async () => {
    const renderer = await render(baseArgs());
    const v = current();
    // The summary (5958) includes the 2000 dated later this month.
    expect(v.hero).toBe(money(5958));
    expect(v.cap).toMatchObject({ state: "ready", tone: "accent" });
    expect(v.stats.primary).toEqual({ label: "Today", value: money(40) });
    expect(v.stats.payments).toEqual({ label: "Payments", value: "2" });
    // 340 so far against 500 + 250 up to 8 October (the 9th does not count).
    expect(v.stats.compare).toMatchObject({
      label: "vs Oct",
      value: `▼ ${money(410)}`,
      tone: "success",
      accessibilityLabel: `${money(410)} less than by 8 October`,
    });
    await act(async () => renderer.unmount());
  });

  it("pages both months' rows with the category filter, and does not ask for last month's summary", async () => {
    const renderer = await render(baseArgs());
    const filters = { categoryId: "cat-1" };
    expect(monthRowsCall("2026-10")).toEqual([2026, 10, { enabled: true, filters }]);
    expect(monthRowsCall("2026-9")).toEqual([2026, 9, { enabled: true, filters }]);
    expect(mockSummaryCalls.find((call) => call.key === "2026-9")?.enabled).toBe(false);
    await act(async () => renderer.unmount());
  });

  it("keeps the comparison loading, and fetches on, while either month has more pages", async () => {
    const fetchNextPage = jest.fn();
    mockRowsByMonth["2026-9"] = mockRowsQuery([row(at(2026, 9, 2), "500.00")], {
      hasNextPage: true,
      fetchNextPage,
    });
    const renderer = await render(baseArgs());
    expect(current().stats.compare.value).toBeNull();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  it("does not page in the background while the screen is not focused", async () => {
    const fetchNextPage = jest.fn();
    mockRowsByMonth["2026-9"] = mockRowsQuery([], { hasNextPage: true, fetchNextPage });
    const renderer = await render(baseArgs({ active: false }));
    expect(fetchNextPage).not.toHaveBeenCalled();
    await renderer.rerender(baseArgs({ active: true }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  it("stops paging after a failed page and shows a dash", async () => {
    const fetchNextPage = jest.fn();
    mockRowsByMonth["2026-9"] = mockRowsQuery([], {
      hasNextPage: true,
      isError: true,
      isFetchNextPageError: true,
      fetchNextPage,
    });
    const renderer = await render(baseArgs());
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(current().stats.compare.value).toBe("—");
    await act(async () => renderer.unmount());
  });

  it("keeps complete cached rows usable after a failed background refetch, and never pages them again", async () => {
    const fetchNextPage = jest.fn();
    mockRowsByMonth["2026-9"] = {
      ...mockRowsQuery([row(at(2026, 9, 2), "500.00"), row(at(2026, 9, 8), "250.00")]),
      isError: true,
      fetchNextPage,
    };
    const renderer = await render(baseArgs());
    expect(current().stats.compare.value).toBe(`▼ ${money(410)}`);
    expect(fetchNextPage).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("shows no comparison for uncategorized this month and pages nothing for it", async () => {
    mockSpendByMonth = { "2026-10": { __uncategorized__: 100 } };
    const fetchNextPage = jest.fn();
    mockRowsByMonth["2026-9"] = mockRowsQuery([], { hasNextPage: true, fetchNextPage });
    const renderer = await render(
      baseArgs({ categoryId: "__uncategorized__", canSetCap: false, rows: [] }),
    );
    expect(monthRowsCall("2026-9")?.[2]).toMatchObject({ enabled: false });
    expect(monthRowsCall("2026-10")?.[2]).toMatchObject({ enabled: false });
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(current().hero).toBe(money(100));
    expect(current().cap).toBeNull();
    expect(current().offerSetCap).toBe(false);
    expect(current().stats.compare).toMatchObject({ value: "—", accessibilityLabel: "No comparison" });
    await act(async () => renderer.unmount());
  });

  it("compares uncategorized in a past month from the summaries", async () => {
    mockSpendByMonth = { "2026-9": { __uncategorized__: 300 }, "2026-8": { __uncategorized__: 100 } };
    const renderer = await render(
      baseArgs({ categoryId: "__uncategorized__", canSetCap: false, rows: [], month: OCTOBER }),
    );
    expect(current().stats.compare.value).toBe(`▲ ${money(200)}`);
    await act(async () => renderer.unmount());
  });

  it("compares a past month in full from the two summaries, with no rows queries", async () => {
    mockSpendByMonth = { "2026-9": { "cat-1": 3100 }, "2026-8": { "cat-1": 3900 } };
    const renderer = await render(baseArgs({ month: OCTOBER }));
    const v = current();
    expect(v.hero).toBe(money(3100));
    expect(v.paceLine).toBeNull();
    expect(v.stats.primary).toEqual({ label: "Avg/day", value: money(100) });
    expect(v.stats.compare).toMatchObject({ label: "vs Sep", value: `▼ ${money(800)}`, tone: "success" });
    expect(monthRowsCall("2026-9")?.[2]).toMatchObject({ enabled: false });
    expect(monthRowsCall("2026-8")?.[2]).toMatchObject({ enabled: false });
    expect(mockSummaryCalls.find((call) => call.key === "2026-8")?.enabled).toBe(true);
    await act(async () => renderer.unmount());
  });

  it("treats the previous month's data as loading while a month change serves the old data", async () => {
    mockSpendPlaceholder = true;
    const renderer = await render(baseArgs());
    expect(current().hero).toBeNull();
    await act(async () => renderer.unmount());
  });

  it("reads the cap from the category budgets and offers to set one when there is none", async () => {
    mockBudgets = [{ category_id: "someone-else", monthly_amount: "500" }];
    const renderer = await render(baseArgs());
    expect(current().cap).toBeNull();
    expect(current().offerSetCap).toBe(true);
    expect(current().paceLine).toBeNull();
    await act(async () => renderer.unmount());
  });

  it("measures 'left' and the pace on the whole month, even the part dated later", async () => {
    const renderer = await render(baseArgs());
    // 4042 left of the cap over the 23 days from 8 to 30 November.
    expect(current().cap).toMatchObject({
      metaLine: `${money(4042)} left of ${money(10000)} · 60%`,
    });
    expect(current().paceLine).toBe(`${money(175)}/day for the next 23 days`);
    await act(async () => renderer.unmount());
  });

  it("shows a dash when last month had no spend", async () => {
    mockRowsByMonth["2026-9"] = mockRowsQuery([]);
    const renderer = await render(baseArgs());
    expect(current().stats.compare.value).toBe("—");
    await act(async () => renderer.unmount());
  });

  it("passes list loading and errors to Today and Payments", async () => {
    const loadingRenderer = await render(baseArgs({ rows: [], rowsStatus: "loading" }));
    expect(current().stats.primary.value).toBeNull();
    expect(current().stats.payments.value).toBeNull();
    await act(async () => loadingRenderer.unmount());

    const errorRenderer = await render(baseArgs({ rows: [], rowsStatus: "error" }));
    expect(current().stats.primary.value).toBe("—");
    expect(current().stats.payments.value).toBe("—");
    // The hero comes from the summary, so a failing list does not blank it.
    expect(current().hero).toBe(money(5958));
    await act(async () => errorRenderer.unmount());
  });

  it("counts debits only for Payments and Today, never credits such as refunds", async () => {
    const renderer = await render(
      baseArgs({
        rows: [
          row(at(2026, 10, 8), "40.00"),
          row(at(2026, 10, 8), "15.00", { type: "credit" }),
          row(at(2026, 10, 2), "300.00"),
        ],
      }),
    );
    expect(current().stats.payments.value).toBe("2");
    expect(current().stats.primary.value).toBe(money(40));
    await act(async () => renderer.unmount());
  });

  it("marks a partly loaded list's payment count with a plus", async () => {
    const renderer = await render(baseArgs({ rowsHaveMore: true }));
    expect(current().stats.payments.value).toBe("2+");
    await act(async () => renderer.unmount());
  });

  it("refetches the card's own queries when the screen refreshes, once per refresh", async () => {
    const previousRefetch = jest.fn();
    mockRowsByMonth["2026-9"] = mockRowsQuery([row(at(2026, 9, 2), "500.00")], { refetch: previousRefetch });
    const renderer = await render(baseArgs({ refreshToken: 0 }));
    expect(mockSummaryRefetch).not.toHaveBeenCalled();

    await renderer.rerender(baseArgs({ refreshToken: 1 }));
    expect(mockSummaryRefetch).toHaveBeenCalledTimes(1); // this month's summary (last month's is a rows query)
    expect(mockBudgetsRefetch).toHaveBeenCalledTimes(1);
    expect(previousRefetch).toHaveBeenCalledTimes(1);

    await renderer.rerender(baseArgs({ refreshToken: 1 }));
    expect(mockBudgetsRefetch).toHaveBeenCalledTimes(1);

    await renderer.rerender(baseArgs({ month: OCTOBER, refreshToken: 2 }));
    // A past month refetches both summaries and no rows.
    expect(mockSummaryRefetch).toHaveBeenCalledTimes(3);
    expect(previousRefetch).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });
});
