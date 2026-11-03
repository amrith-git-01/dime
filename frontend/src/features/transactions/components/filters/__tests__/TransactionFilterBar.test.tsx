import {
  press,
  pressables,
  renderTree,
  textsOf,
  unmountTree,
} from "@/features/brokeReport/components/__tests__/testHarness";
import { ThemeProvider } from "@/theme/ThemeProvider";

import { DEFAULT_LIST_CRITERIA, type ListCriteria } from "../../../utils/monthListFilter";
import { TransactionFilterBar } from "../TransactionFilterBar";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/features/categories/hooks/useCategories", () => ({
  useCategories: (scope: string) => ({
    categories:
      scope === "spend"
        ? [
            { id: "c-food", name: "Food" },
            { id: "c-fun", name: "Fun" },
            { id: "c-rent", name: "Rent" },
          ]
        : [],
  }),
}));

const PAYEES = [
  { key: "swiggy", name: "Swiggy", count: 4, totalPaise: 200_000 },
  { key: "uber", name: "Uber", count: 2, totalPaise: 90_000 },
];

async function render(criteria: ListCriteria = DEFAULT_LIST_CRITERIA) {
  const onCriteriaChange = jest.fn();
  const tree = await renderTree(
    <ThemeProvider>
      <TransactionFilterBar
        criteria={criteria}
        onCriteriaChange={onCriteriaChange}
        payeeOptions={PAYEES}
      />
    </ThemeProvider>,
  );
  return { tree, onCriteriaChange };
}

describe("TransactionFilterBar", () => {
  it("shows the five filters by name with no Clear while nothing is on", async () => {
    const { tree } = await render();
    const texts = textsOf(tree);
    for (const name of ["Type", "Category", "Payee", "Amount", "Sort"]) {
      expect(texts).toContain(name);
      expect(pressables(tree, `${name} filter, double tap to choose`).length).toBeGreaterThan(0);
    }
    expect(pressables(tree, "Clear all filters")).toHaveLength(0);
    unmountTree(tree);
  });

  it("active chips show their value and a clear button of their own", async () => {
    const { tree } = await render({
      ...DEFAULT_LIST_CRITERIA,
      type: "spent",
      categoryIds: ["c-food", "c-fun", "c-rent"],
      payeeKeys: ["swiggy"],
      amountMinPaise: 50_000,
      amountMaxPaise: 200_000,
      sort: "oldest",
    });
    const texts = textsOf(tree);
    expect(texts).toEqual(expect.arrayContaining(["Spent", "Food +2", "Swiggy", "₹500–2,000", "Oldest"]));
    expect(pressables(tree, "Category filter, Food and 2 more, double tap to change").length).toBeGreaterThan(0);
    for (const name of ["type", "category", "payee", "amount", "sort"]) {
      expect(pressables(tree, `Clear ${name} filter`).length).toBeGreaterThan(0);
    }
    expect(pressables(tree, "Clear all filters").length).toBeGreaterThan(0);
    unmountTree(tree);
  });

  it("clearing one chip clears only that filter", async () => {
    const criteria: ListCriteria = {
      ...DEFAULT_LIST_CRITERIA,
      type: "recurring",
      categoryIds: ["c-food"],
      search: "tea",
    };
    const { tree, onCriteriaChange } = await render(criteria);
    press(tree, "Clear category filter");
    expect(onCriteriaChange).toHaveBeenCalledWith({ ...criteria, categoryIds: [] });
    press(tree, "Clear type filter");
    expect(onCriteriaChange).toHaveBeenLastCalledWith({ ...criteria, type: "all" });
    unmountTree(tree);
  });

  it("Clear resets everything, search included", async () => {
    const { tree, onCriteriaChange } = await render({
      ...DEFAULT_LIST_CRITERIA,
      type: "received",
      search: "salary",
    });
    press(tree, "Clear all filters");
    expect(onCriteriaChange).toHaveBeenCalledWith(DEFAULT_LIST_CRITERIA);
    unmountTree(tree);
  });

  it("a chip opens its picker, and picking applies at once", async () => {
    const { tree, onCriteriaChange } = await render();
    press(tree, "Type filter, double tap to choose");
    expect(textsOf(tree)).toEqual(
      expect.arrayContaining(["All", "Spent", "Recurring", "Flexible", "Received"]),
    );
    press(tree, "Received");
    expect(onCriteriaChange).toHaveBeenCalledWith({ ...DEFAULT_LIST_CRITERIA, type: "received" });
    // A single-select picker closes after the choice.
    expect(textsOf(tree)).not.toContain("Done");
    unmountTree(tree);
  });

  it("the category picker is a multi-select that stays open", async () => {
    const { tree, onCriteriaChange } = await render();
    press(tree, "Category filter, double tap to choose");
    press(tree, "Food");
    expect(onCriteriaChange).toHaveBeenCalledWith({ ...DEFAULT_LIST_CRITERIA, categoryIds: ["c-food"] });
    expect(textsOf(tree)).toContain("Done");
    unmountTree(tree);
  });

  it("the payee picker lists the month's payees with their counts", async () => {
    const { tree, onCriteriaChange } = await render();
    press(tree, "Payee filter, double tap to choose");
    expect(textsOf(tree)).toEqual(expect.arrayContaining(["Swiggy", "Uber"]));
    press(tree, "Swiggy, 4 transactions");
    expect(onCriteriaChange).toHaveBeenCalledWith({ ...DEFAULT_LIST_CRITERIA, payeeKeys: ["swiggy"] });
    unmountTree(tree);
  });
});
