import {
  press,
  pressables,
  renderTree,
  runAct,
  textsOf,
  unmountTree,
} from "@/features/brokeReport/components/__tests__/testHarness";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { formatInrCompact } from "@/utils/currency";

import type { AmountDomain } from "../../../utils/amountRange";
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
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
}));
jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual("react-native");
  // Every builder method returns the same chainable object; detectors just render children.
  const chain: Record<string, unknown> = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain },
    GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    GestureDetector: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});
jest.mock("@/features/categories/hooks/useCategories", () => ({
  useCategories: (scope: string) => ({
    categories:
      scope === "spend"
        ? [
            { id: "c-food", name: "Food" },
            { id: "c-fun", name: "Fun" },
          ]
        : scope === "recurring_expense"
          ? [{ id: "c-rent", name: "Rent" }]
          : [{ id: "c-salary", name: "Salary" }],
  }),
}));

const PAYEES = [
  { key: "swiggy", name: "Swiggy", count: 4, totalPaise: 200_000 },
  { key: "uber", name: "Uber", count: 2, totalPaise: 90_000 },
];

const DOMAIN: AmountDomain = { minPaise: 10_000, maxPaise: 60_000, stepPaise: 5_000, steps: 10 };

async function render(
  criteria: ListCriteria = DEFAULT_LIST_CRITERIA,
  amountDomain: AmountDomain | null = DOMAIN,
) {
  const onCriteriaChange = jest.fn();
  const tree = await renderTree(
    <ThemeProvider>
      <TransactionFilterBar
        criteria={criteria}
        onCriteriaChange={onCriteriaChange}
        payeeOptions={PAYEES}
        amountDomain={amountDomain}
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
      type: "expense",
      categoryIds: ["c-food", "c-fun", "c-rent"],
      payeeKeys: ["swiggy"],
      amountMinPaise: 50_000,
      amountMaxPaise: 200_000,
      sort: "oldest",
    });
    const texts = textsOf(tree);
    expect(texts).toEqual(
      expect.arrayContaining(["Expense", "Food +2", "Swiggy", `${formatInrCompact(500)} – ${formatInrCompact(2000)}`, "Oldest"]),
    );
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
      type: "income",
      search: "salary",
    });
    press(tree, "Clear all filters");
    expect(onCriteriaChange).toHaveBeenCalledWith(DEFAULT_LIST_CRITERIA);
    unmountTree(tree);
  });

  it("a chip opens its picker in a modal, and picking applies at once and closes it", async () => {
    const { tree, onCriteriaChange } = await render();
    press(tree, "Type filter, double tap to choose");
    const texts = textsOf(tree);
    expect(texts).toEqual(expect.arrayContaining(["Expense", "Income", "Recurring", "Flexible"]));
    expect(texts).not.toContain("All");
    press(tree, "Income");
    expect(onCriteriaChange).toHaveBeenCalledWith({ ...DEFAULT_LIST_CRITERIA, type: "income" });
    // A single-select picker collapses after the choice.
    expect(textsOf(tree)).not.toContain("Recurring");
    unmountTree(tree);
  });

  it("picking the active type again clears it", async () => {
    const { tree, onCriteriaChange } = await render({ ...DEFAULT_LIST_CRITERIA, type: "expense" });
    press(tree, "Type filter, Expense, double tap to change");
    press(tree, "Expense");
    expect(onCriteriaChange).toHaveBeenCalledWith({ ...DEFAULT_LIST_CRITERIA, type: "all" });
    unmountTree(tree);
  });

  it("the close button and the scrim close the modal", async () => {
    const { tree } = await render();
    press(tree, "Type filter, double tap to choose");
    expect(textsOf(tree)).toContain("Flexible");
    press(tree, "Close");
    expect(textsOf(tree)).not.toContain("Flexible");
    press(tree, "Type filter, double tap to choose");
    press(tree, "Close filter");
    expect(textsOf(tree)).not.toContain("Flexible");
    unmountTree(tree);
  });

  it("shows one panel at a time", async () => {
    const { tree } = await render();
    press(tree, "Type filter, double tap to choose");
    press(tree, "Sort filter, double tap to choose");
    const texts = textsOf(tree);
    expect(texts).toContain("Highest amount");
    expect(texts).not.toContain("Flexible");
    unmountTree(tree);
  });

  it("the category picker lists the spending categories and Uncategorized, not recurring ones", async () => {
    const { tree, onCriteriaChange } = await render();
    press(tree, "Category filter, double tap to choose");
    const texts = textsOf(tree);
    expect(texts).toEqual(expect.arrayContaining(["Uncategorized", "Food", "Fun"]));
    expect(texts).not.toContain("Rent");
    expect(texts).not.toContain("Salary");
    press(tree, "Food");
    expect(onCriteriaChange).toHaveBeenCalledWith({ ...DEFAULT_LIST_CRITERIA, categoryIds: ["c-food"] });
    // A multi-select stays open.
    expect(textsOf(tree)).toContain("Fun");
    unmountTree(tree);
  });

  it("a seeded recurring category gets a ticked row so it can be unticked", async () => {
    const { tree, onCriteriaChange } = await render({ ...DEFAULT_LIST_CRITERIA, categoryIds: ["c-rent"] });
    press(tree, "Category filter, Rent, double tap to change");
    const row = pressables(tree, "Rent").find((node) => node.props.accessibilityState);
    expect(row?.props.accessibilityState).toEqual({ selected: true });
    expect(textsOf(tree)).not.toContain("Salary");
    press(tree, "Rent");
    expect(onCriteriaChange).toHaveBeenCalledWith({ ...DEFAULT_LIST_CRITERIA, categoryIds: [] });
    unmountTree(tree);
  });

  it("a seeded recurring category still shows its name on the chip", async () => {
    const { tree } = await render({ ...DEFAULT_LIST_CRITERIA, categoryIds: ["c-rent"] });
    expect(textsOf(tree)).toContain("Rent");
    unmountTree(tree);
  });

  it("the payee picker lists the month payees with their counts", async () => {
    const { tree, onCriteriaChange } = await render();
    press(tree, "Payee filter, double tap to choose");
    expect(textsOf(tree)).toEqual(expect.arrayContaining(["Swiggy", "Uber"]));
    press(tree, "Swiggy, 4 transactions");
    expect(onCriteriaChange).toHaveBeenCalledWith({ ...DEFAULT_LIST_CRITERIA, payeeKeys: ["swiggy"] });
    unmountTree(tree);
  });

  it("the amount panel shows the range slider with a thumb for each end", async () => {
    const { tree } = await render();
    press(tree, "Amount filter, double tap to choose");
    const thumbs = tree.root.findAll((node) => node.props.accessibilityRole === "adjustable");
    const labels = thumbs.map((node) => node.props.accessibilityLabel);
    expect(labels).toEqual(expect.arrayContaining(["Minimum amount", "Maximum amount"]));
    const min = thumbs.find((node) => node.props.accessibilityLabel === "Minimum amount");
    expect(min?.props.accessibilityValue).toEqual({ text: formatInrCompact(100) });
    expect(textsOf(tree)).not.toContain("Reset");
    unmountTree(tree);
  });

  it("a thumb accessibility action moves it a step and sets only that side", async () => {
    const { tree, onCriteriaChange } = await render();
    press(tree, "Amount filter, double tap to choose");
    const min = tree.root.findAll(
      (node) =>
        node.props.accessibilityLabel === "Minimum amount" &&
        typeof node.props.onAccessibilityAction === "function",
    )[0];
    runAct(() => {
      (min.props.onAccessibilityAction as (e: unknown) => void)({
        nativeEvent: { actionName: "increment" },
      });
    });
    expect(onCriteriaChange).toHaveBeenLastCalledWith({
      ...DEFAULT_LIST_CRITERIA,
      amountMinPaise: 15_000,
      amountMaxPaise: null,
    });
    unmountTree(tree);
  });

  it("nudging one thumb keeps the other bound exactly, and shows the real value", async () => {
    const { tree, onCriteriaChange } = await render({
      ...DEFAULT_LIST_CRITERIA,
      amountMinPaise: 21_234,
      amountMaxPaise: 47_321,
    });
    press(tree, `Amount filter, ${formatInrCompact(212)} – ${formatInrCompact(473)}, double tap to change`);
    const thumb = (label: string) =>
      tree.root.findAll(
        (node) =>
          node.props.accessibilityLabel === label &&
          typeof node.props.onAccessibilityAction === "function",
      )[0];
    expect(thumb("Minimum amount").props.accessibilityValue).toEqual({ text: formatInrCompact(212.34) });
    expect(thumb("Maximum amount").props.accessibilityValue).toEqual({ text: formatInrCompact(473.21) });
    runAct(() => {
      (thumb("Maximum amount").props.onAccessibilityAction as (e: unknown) => void)({
        nativeEvent: { actionName: "decrement" },
      });
    });
    expect(onCriteriaChange).toHaveBeenLastCalledWith({
      ...DEFAULT_LIST_CRITERIA,
      amountMinPaise: 21_234,
      amountMaxPaise: 45_000,
    });
    unmountTree(tree);
  });

  it("Reset in the amount panel clears the range", async () => {
    const { tree, onCriteriaChange } = await render({
      ...DEFAULT_LIST_CRITERIA,
      amountMinPaise: 20_000,
      amountMaxPaise: 45_000,
    });
    press(tree, `Amount filter, ${formatInrCompact(200)} – ${formatInrCompact(450)}, double tap to change`);
    press(tree, "Reset amount range");
    expect(onCriteriaChange).toHaveBeenCalledWith({
      ...DEFAULT_LIST_CRITERIA,
      amountMinPaise: null,
      amountMaxPaise: null,
    });
    unmountTree(tree);
  });

  it("without a usable range the amount panel says so instead of showing a slider", async () => {
    const { tree } = await render(DEFAULT_LIST_CRITERIA, null);
    press(tree, "Amount filter, double tap to choose");
    expect(textsOf(tree).some((text) => text.startsWith("Nothing to slide yet"))).toBe(true);
    expect(tree.root.findAll((node) => node.props.accessibilityRole === "adjustable")).toHaveLength(0);
    unmountTree(tree);
  });
});
