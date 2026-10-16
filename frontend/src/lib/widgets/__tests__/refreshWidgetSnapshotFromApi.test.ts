import { fetchBudget } from "@/features/budgets/api/budgetsApi";
import { fetchCategoryBudgets } from "@/features/budgets/api/categoryBudgetsApi";
import { fetchHomeOverview } from "@/features/transactions/api/transactionsApi";
import { getSession } from "@/lib/auth/session";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { refreshWidgetSnapshotFromApi } from "../refreshWidgetSnapshotFromApi";
import { readWidgetSnapshot } from "../widgetSnapshotMmkv";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/features/budgets/api/budgetsApi", () => ({ fetchBudget: jest.fn() }));
jest.mock("@/features/budgets/api/categoryBudgetsApi", () => ({ fetchCategoryBudgets: jest.fn() }));
jest.mock("@/features/transactions/api/transactionsApi", () => ({ fetchHomeOverview: jest.fn() }));
jest.mock("@/lib/auth/session", () => ({ getSession: jest.fn() }));

const OVERVIEW = {
  spent_today: "0.00",
  spent_this_month: "-1000.00",
  fixed_spent_this_month: "400.00",
  flexible_spent_this_month: "600.00",
  top_categories: [
    { category_id: "cat-food", name: "Food", icon_name: null, color: null, total: "700.00" },
  ],
  recent_transactions: [],
};

describe("refreshWidgetSnapshotFromApi", () => {
  beforeEach(() => {
    resetMockMmkv();
    jest.resetAllMocks();
    jest.mocked(getSession).mockReturnValue({ user: { id: "user-a" } } as never);
    jest.mocked(fetchHomeOverview).mockResolvedValue(OVERVIEW as never);
    jest.mocked(fetchBudget).mockResolvedValue({ budget: { monthly_budget: "5000.00" } } as never);
    jest.mocked(fetchCategoryBudgets).mockResolvedValue([
      { category_id: "cat-food", monthly_amount: "1000.00" },
    ] as never);
  });

  it("fetches the overview and budgets and stores the snapshot", async () => {
    await expect(refreshWidgetSnapshotFromApi("user-a")).resolves.toBe(true);
    expect(readWidgetSnapshot()).toMatchObject({
      userId: "user-a",
      spentThisMonth: 1000,
      recurringSpent: 400,
      flexibleSpent: 600,
      monthlyBudget: 5000,
      budgetLeft: 4000,
      topCategories: [{ id: "cat-food", name: "Food", spent: 700, budget: 1000 }],
    });
  });

  it("does nothing for an account that is not signed in", async () => {
    await expect(refreshWidgetSnapshotFromApi("user-b")).resolves.toBe(false);
    expect(fetchHomeOverview).not.toHaveBeenCalled();
    expect(readWidgetSnapshot()).toBeNull();
  });

  it("writes nothing when the user signed out while the requests were in flight", async () => {
    jest.mocked(fetchHomeOverview).mockImplementation(async () => {
      jest.mocked(getSession).mockReturnValue(null);
      return OVERVIEW as never;
    });
    await expect(refreshWidgetSnapshotFromApi("user-a")).resolves.toBe(false);
    expect(readWidgetSnapshot()).toBeNull();
  });

  it("rejects on a network error and leaves the old snapshot alone", async () => {
    jest.mocked(fetchBudget).mockRejectedValue(new Error("offline"));
    await expect(refreshWidgetSnapshotFromApi("user-a")).rejects.toThrow("offline");
    expect(readWidgetSnapshot()).toBeNull();
  });
});
