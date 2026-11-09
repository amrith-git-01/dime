import { createElement, type ReactElement } from "react";

import { TOUR_SAMPLE_ID_PREFIX } from "@/features/tourPreview";
import { UNCATEGORIZED_CATEGORY_KEY } from "@/features/transactions/constants/uncategorizedCategoryKey";
import type { TransactionRow } from "@/features/transactions/types";

import { useTransactionsListScreenModel } from "../useTransactionsListScreenModel";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));

const mockNavigation = { navigate: jest.fn(), push: jest.fn(), setOptions: jest.fn() };
let mockParams: Record<string, unknown>;
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockParams }),
}));

let mockCategories: { id: string; name: string }[] = [];
jest.mock("@/features/categories/hooks/useCategories", () => ({
  useCategories: () => ({ categories: mockCategories, isLoading: false }),
}));

function mockQuery(items: TransactionRow[] = []) {
  return {
    data: { pages: [{ items, has_more: false }], pageParams: [0] },
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isPending: false,
    isError: false,
    isFetchNextPageError: false,
    isRefetching: false,
    refetch: jest.fn(),
  };
}
const mockMonthQuery = jest.fn((..._args: unknown[]) => mockQuery());
const mockRangeQuery = jest.fn((..._args: unknown[]) => mockQuery());
jest.mock("@/features/transactions/hooks/useTransactionsOverviewQueries", () => ({
  useTransactionsMonthInfiniteQuery: (...args: unknown[]) => mockMonthQuery(...args),
  useTransactionsRangeInfiniteQuery: (...args: unknown[]) => mockRangeQuery(...args),
  useTransactionsHistoryInfiniteQuery: () => mockQuery(),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void; update: (element: ReactElement) => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

let model: ReturnType<typeof useTransactionsListScreenModel> | undefined;
function Probe() {
  model = useTransactionsListScreenModel();
  return null;
}
const current = () => {
  if (!model) throw new Error("not rendered");
  return model;
};

let renderer: ReturnType<typeof create> | undefined;
async function open(params: Record<string, unknown>) {
  mockParams = params;
  await act(async () => {
    renderer = create(createElement(Probe));
  });
}
async function rerender(params: Record<string, unknown>) {
  mockParams = params;
  await act(async () => {
    renderer?.update(createElement(Probe));
  });
}

const categoryParams = {
  filter: "category",
  year: 2026,
  monthIndex0: 10,
  categoryId: "cat-shopping",
  categoryDisplayName: "Shopping",
};

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
  jest.clearAllMocks();
  mockCategories = [{ id: "cat-shopping", name: "Shopping" }];
  model = undefined;
});
afterEach(async () => {
  await act(async () => {
    renderer?.unmount();
  });
  renderer = undefined;
});

const lastMonthCall = () => mockMonthQuery.mock.calls[mockMonthQuery.mock.calls.length - 1];

describe("the category list's month card", () => {
  it("starts on the route's month and lists that month's rows", async () => {
    await open(categoryParams);
    const card = current().categoryCard;
    expect(card).not.toBeNull();
    expect(card?.monthLabel).toBe("November 2026");
    expect(card?.canGoNextMonth).toBe(false);
    expect(card?.canGoPrevMonth).toBe(true);
    expect(card?.prevMonthLabel).toBe("October 2026");
    expect(lastMonthCall()?.slice(0, 2)).toEqual([2026, 10]);
    expect(current().subtitle).toContain("November 2026");
  });

  it("moves the list and the subtitle to the month it is stepped to", async () => {
    await open(categoryParams);
    await act(async () => {
      current().categoryCard?.onPrevMonth();
    });
    expect(current().categoryCard?.monthLabel).toBe("October 2026");
    expect(current().categoryCard?.canGoNextMonth).toBe(true);
    expect(lastMonthCall()?.slice(0, 2)).toEqual([2026, 9]);
    expect(current().subtitle).toContain("October 2026");
    expect(current().categoryCard?.monthKey).toBe("2026-9");

    await act(async () => {
      current().categoryCard?.onNextMonth();
    });
    expect(current().categoryCard?.monthLabel).toBe("November 2026");
    expect(lastMonthCall()?.slice(0, 2)).toEqual([2026, 10]);
  });

  it("goes back 11 months from now and no further", async () => {
    await open(categoryParams);
    for (let step = 0; step < 11; step += 1) {
      await act(async () => {
        current().categoryCard?.onPrevMonth();
      });
    }
    expect(current().categoryCard?.monthLabel).toBe("December 2025");
    expect(current().categoryCard?.canGoPrevMonth).toBe(false);
    await act(async () => {
      current().categoryCard?.onPrevMonth();
    });
    expect(current().categoryCard?.monthLabel).toBe("December 2025");
  });

  it("allows an older route month and goes forward from it", async () => {
    await open({ ...categoryParams, year: 2025, monthIndex0: 2 });
    expect(current().categoryCard?.monthLabel).toBe("March 2025");
    expect(current().categoryCard?.canGoPrevMonth).toBe(false);
    expect(current().categoryCard?.canGoNextMonth).toBe(true);
  });

  it("starts on the current month when the route's month is in the future", async () => {
    await open({ ...categoryParams, year: 2027, monthIndex0: 0 });
    const card = current().categoryCard;
    expect(card?.monthLabel).toBe("November 2026");
    expect(card?.canGoNextMonth).toBe(false);
    expect(card?.canGoPrevMonth).toBe(true);
    expect(lastMonthCall()?.slice(0, 2)).toEqual([2026, 10]);
  });

  it("asks the card to refetch its own queries whenever the list is retried", async () => {
    await open(categoryParams);
    expect(current().categoryCard?.refreshToken).toBe(0);
    await act(async () => {
      current().retry();
    });
    expect(current().categoryCard?.refreshToken).toBe(1);
    await act(async () => {
      current().retry();
    });
    expect(current().categoryCard?.refreshToken).toBe(2);
  });

  it("starts over on a new route month", async () => {
    await open(categoryParams);
    await act(async () => {
      current().categoryCard?.onPrevMonth();
    });
    expect(current().categoryCard?.monthLabel).toBe("October 2026");
    await rerender({ ...categoryParams, year: 2026, monthIndex0: 7 });
    expect(current().categoryCard?.monthLabel).toBe("August 2026");
  });

  it("follows a rename of the category in the card and the header title", async () => {
    await open(categoryParams);
    expect(current().categoryCard?.categoryName).toBe("Shopping");
    mockCategories = [{ id: "cat-shopping", name: "Online shopping" }];
    await rerender(categoryParams);
    expect(current().categoryCard?.categoryName).toBe("Online shopping");
    expect(mockNavigation.setOptions).toHaveBeenLastCalledWith({ title: "Online shopping" });
  });

  it("opens the category editor", async () => {
    await open(categoryParams);
    expect(current().categoryCard?.canEdit).toBe(true);
    current().categoryCard?.onEdit();
    expect(mockNavigation.navigate).toHaveBeenCalledWith("EditCategory", {
      categoryId: "cat-shopping",
    });
  });

  it("cannot edit uncategorized, a recurring category or a tour sample", async () => {
    await open({ ...categoryParams, categoryId: UNCATEGORIZED_CATEGORY_KEY, categoryDisplayName: "Uncategorized" });
    expect(current().categoryCard).not.toBeNull();
    expect(current().categoryCard?.canEdit).toBe(false);
    expect(current().categoryCard?.categoryName).toBe("Uncategorized");

    await rerender({ ...categoryParams, categoryId: "cat-rent", categoryDisplayName: "Rent" });
    expect(current().categoryCard?.canEdit).toBe(false);

    const sampleId = `${TOUR_SAMPLE_ID_PREFIX}0000-4000-8000-000000000001`;
    mockCategories = [{ id: sampleId, name: "Shopping" }];
    await rerender({ ...categoryParams, categoryId: sampleId });
    expect(current().categoryCard?.canEdit).toBe(false);
  });

  it("passes the loading state of the list to the card", async () => {
    mockMonthQuery.mockReturnValueOnce({ ...mockQuery(), data: undefined as never, isPending: true });
    await open(categoryParams);
    expect(current().categoryCard?.rowsStatus).toBe("loading");
  });

  it("has no card for a link that carries its own date range", async () => {
    await open({
      ...categoryParams,
      fromIso: "2026-10-01T00:00:00+05:30",
      toIso: "2026-10-15T00:00:00+05:30",
    });
    expect(current().categoryCard).toBeNull();
    expect(mockRangeQuery).toHaveBeenCalled();
  });

  it("has no card for other lists", async () => {
    await open({
      filter: "payee",
      year: 2026,
      monthIndex0: 10,
      payeeId: "swiggy",
      payeeKeysTop: [],
      payeeDisplayName: "Swiggy",
    });
    expect(current().categoryCard).toBeNull();
    await rerender({ filter: "day", year: 2026, monthIndex0: 10, dayKey: "2026-11-03" });
    expect(current().categoryCard).toBeNull();
  });
});
