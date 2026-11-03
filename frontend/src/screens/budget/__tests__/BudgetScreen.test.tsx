import { Text } from "react-native";

import { ThemeProvider } from "@/theme/ThemeProvider";

import BudgetScreen from "../BudgetScreen";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  LinearTransition: {
    springify: () => ({ damping: () => ({ stiffness: () => ({ mass: () => ({}) }) }) }),
  },
}));

const mockOrder = {
  value: {
    order: ["budgets.summary", "budgets.recurring", "budgets.categories"] as string[],
    ready: true,
    commit: jest.fn(),
  },
};
jest.mock("@/features/cardLayout/hooks/useCardOrder", () => ({
  useCardOrder: () => mockOrder.value,
}));
jest.mock("@/features/cardLayout/components/ArrangeCards", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { ArrangeCards: ({ screen }: { screen: string }) => <T>{`ARRANGE ${screen}`}</T> };
});

jest.mock("@/features/budgets/components", () => {
  const { Text: T } = jest.requireActual("react-native");
  return {
    BudgetSummaryCard: () => <T>SUMMARY</T>,
    BudgetCategoriesSectionHeader: () => <T>CATEGORIES HEADER</T>,
    BudgetCategoryRowsSkeleton: () => <T>CATEGORIES SKELETON</T>,
    BudgetCategoryRow: ({
      item,
      isFirst,
      isLast,
      tourTargetId,
    }: {
      item: { id: string };
      isFirst: boolean;
      isLast: boolean;
      tourTargetId?: string;
    }) => <T>{`ROW ${item.id} first=${isFirst} last=${isLast} tour=${tourTargetId ?? "-"}`}</T>,
  };
});
jest.mock("@/features/recurring/components", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { RecurringSection: () => <T>RECURRING</T> };
});

const mockModel: Record<string, unknown> = {};
jest.mock("../useBudgetScreenModel", () => ({
  UNCATEGORIZED_SPEND_KEY: "uncategorized",
  useBudgetScreenModel: () => mockModel,
}));
const mockRecurring = { income: {}, subscriptions: {}, today: new Date(0), onAdd: jest.fn(), onItemPress: jest.fn(), onItemEdit: jest.fn(), onAddReminder: jest.fn(), onSeeReminders: jest.fn() };
jest.mock("../useBudgetRecurringModel", () => ({
  useBudgetRecurringModel: () => mockRecurring,
}));
const mockSectionScroll = { onCardLayout: jest.fn() };
jest.mock("../useBudgetSectionScroll", () => ({
  useBudgetSectionScroll: () => mockSectionScroll,
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => Tree;
};
/* eslint-enable @typescript-eslint/no-require-imports */

type Node = { props: Record<string, unknown>; type: unknown };
type Tree = {
  root: {
    findAll: (predicate: (node: Node) => boolean) => Node[];
    findAllByType: (type: unknown) => Node[];
  };
  unmount: () => void;
};

const rows = [
  { id: "food", name: "Food" },
  { id: "rent", name: "Rent" },
  { id: "fun", name: "Fun" },
];

function resetModel(over: Record<string, unknown> = {}) {
  Object.assign(mockModel, {
    addCustomCategoryDisabled: false,
    budgetListKey: "2026-10",
    canGoPrevMonth: true,
    canGoNextMonth: false,
    goPrevMonth: jest.fn(),
    goNextMonth: jest.fn(),
    handleAddCustomCategory: jest.fn(),
    handleEditBudget: jest.fn(),
    handleEditCategory: jest.fn(),
    openCategoryTransactions: jest.fn(),
    handleSetBudget: jest.fn(),
    hasMonthlyBudget: true,
    isListLoading: false,
    listData: rows,
    monthSummary: null,
    monthSummaryFailed: false,
    monthlyBudgetAmount: 1000,
    selectedMonth: { label: "October 2026" },
    showCurrentMonth: jest.fn(),
    suggestedBudget: 0,
    summaryLoading: false,
    ...over,
  });
}

function render() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let tree!: Tree;
  act(() => {
    tree = create(
      <ThemeProvider>
        <BudgetScreen />
      </ThemeProvider>,
    );
  });
  return tree;
}

const texts = (tree: Tree) =>
  tree.root.findAll((n) => n.type === Text).map((n) => String(n.props.children));

beforeEach(() => {
  resetModel();
  mockOrder.value = {
    order: ["budgets.summary", "budgets.recurring", "budgets.categories"],
    ready: true,
    commit: jest.fn(),
  };
  mockSectionScroll.onCardLayout.mockReset();
});

describe("BudgetScreen", () => {
  it("renders the summary, recurring and category blocks in the default order, then Arrange", () => {
    const tree = render();
    expect(texts(tree)).toEqual([
      "SUMMARY",
      "RECURRING",
      "CATEGORIES HEADER",
      "ROW food first=true last=false tour=budgets.firstCategory",
      "ROW rent first=false last=false tour=-",
      "ROW fun first=false last=true tour=-",
      "ARRANGE budgets",
    ]);
    act(() => tree.unmount());
  });

  it("follows the user's order", () => {
    mockOrder.value.order = ["budgets.categories", "budgets.summary", "budgets.recurring"];
    const tree = render();
    expect(texts(tree).slice(0, 3)).toEqual(["CATEGORIES HEADER", "ROW food first=true last=false tour=budgets.firstCategory", "ROW rent first=false last=false tour=-"]);
    expect(texts(tree).slice(-3)).toEqual(["SUMMARY", "RECURRING", "ARRANGE budgets"]);
    act(() => tree.unmount());
  });

  it("keeps the categories header mounted while the rows load, with the skeleton under it", () => {
    resetModel({ isListLoading: true });
    const tree = render();
    expect(texts(tree)).toContain("CATEGORIES HEADER");
    expect(texts(tree)).toContain("CATEGORIES SKELETON");
    expect(texts(tree).some((t) => t.startsWith("ROW"))).toBe(false);
    act(() => tree.unmount());
  });

  it("shows the empty state when there are no categories", () => {
    resetModel({ listData: [] });
    const tree = render();
    expect(texts(tree)).toContain("CATEGORIES HEADER");
    expect(texts(tree).some((t) => t.startsWith("ROW"))).toBe(false);
    expect(texts(tree).join(" ")).toMatch(/categor/i);
    act(() => tree.unmount());
  });

  it("is a scroll view the tour can drive, and reports every card's layout for scroll-to", () => {
    const tree = render();
    const scroll = tree.root.findAll((n) => n.props.contentContainerStyle !== undefined && typeof n.props.onScroll === "function");
    expect(scroll.length).toBeGreaterThan(0);
    // The card wrappers (host views; the animated component above each one carries the same props).
    const wrappers = tree.root.findAll(
      (n) => typeof n.type === "string" && typeof n.props.onLayout === "function",
    );
    expect(wrappers.length).toBeGreaterThanOrEqual(3);
    const event = { nativeEvent: { layout: { x: 0, y: 200, width: 360, height: 120 } } };
    for (const wrapper of wrappers) {
      (wrapper.props.onLayout as (e: unknown) => void)(event);
    }
    // The section scroll hook gets the id of each card (it keeps the recurring and categories ones).
    const ids = mockSectionScroll.onCardLayout.mock.calls.map((call) => call[0] as string);
    expect(ids).toEqual(expect.arrayContaining(["budgets.summary", "budgets.recurring", "budgets.categories"]));
    expect(mockSectionScroll.onCardLayout).toHaveBeenCalledWith("budgets.recurring", event);
    expect(mockSectionScroll.onCardLayout).toHaveBeenCalledWith("budgets.categories", event);
    act(() => tree.unmount());
  });

  it("shows a loading state instead of the blocks while a new device waits for its order", () => {
    mockOrder.value.ready = false;
    const tree = render();
    expect(texts(tree)).toEqual(["ARRANGE budgets"]);
    act(() => tree.unmount());
  });
});
