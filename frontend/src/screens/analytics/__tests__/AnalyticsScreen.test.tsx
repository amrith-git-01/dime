import { Text } from "react-native";

import { ThemeProvider } from "@/theme/ThemeProvider";

import AnalyticsScreen from "../AnalyticsScreen";

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

const DEFAULT_ORDER = [
  "insights.month",
  "insights.summary",
  "insights.fixedCosts",
  "insights.cashflow",
  "insights.payees",
  "insights.income",
  "insights.topExpenses",
  "insights.compare",
];
const mockOrder = {
  value: { order: DEFAULT_ORDER, ready: true, commit: jest.fn() } as {
    order: string[];
    ready: boolean;
    commit: jest.Mock;
  },
};
jest.mock("@/features/cardLayout/hooks/useCardOrder", () => ({
  useCardOrder: () => mockOrder.value,
}));
jest.mock("@/features/cardLayout/components/ArrangeCards", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { ArrangeCards: ({ screen }: { screen: string }) => <T>{`ARRANGE ${screen}`}</T> };
});

jest.mock("@/features/brokeReport/components", () => ({
  ReportBanner: () => null,
  PastReportsShelf: () => null,
}));

jest.mock("@/features/analytics/components", () => {
  const { Text: T } = jest.requireActual("react-native");
  const stub = (label: string) =>
    function Stub() {
      return <T>{label}</T>;
    };
  return {
    InsightsMonthSwitcher: stub("MONTH"),
    InsightsMonthSummaryCard: stub("SUMMARY"),
    InsightsFixedCostsCard: stub("FIXED"),
    InsightsDailyCashflowChart: stub("CASHFLOW"),
    InsightsCounterpartyDonutCard: function DonutStub({ variant }: { variant?: string }) {
      return <T>{variant === "income" ? "INCOME" : "PAYEES"}</T>;
    },
    InsightsTopExpensesCard: stub("TOP"),
    InsightsMonthCompareLauncherCard: stub("COMPARE"),
    InsightsEmptyChartCard: stub("EMPTY"),
    InsightsHeavyChartsPlaceholder: stub("PLACEHOLDER"),
  };
});

const mockModel: Record<string, unknown> = {};
jest.mock("../useAnalyticsScreenModel", () => ({
  useAnalyticsScreenModel: () => mockModel,
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => Tree;
};
/* eslint-enable @typescript-eslint/no-require-imports */

type Node = { props: Record<string, unknown>; type: unknown };
type Tree = {
  root: { findAll: (predicate: (node: Node) => boolean) => Node[] };
  unmount: () => void;
};

function resetModel(over: Record<string, unknown> = {}) {
  Object.assign(mockModel, {
    monthEmpty: false,
    chartsReady: true,
    chartsDataSettled: true,
    monthOptions: [{ label: "October 2026" }, { label: "September 2026" }],
    selectedMonth: { label: "October 2026" },
    selectedMonthIndex: 0,
    openInsightsMonthCompare: jest.fn(),
    summary: null,
    summaryLoading: false,
    summaryFailed: false,
    hasMonthlyBudget: true,
    chartLoading: false,
    fixedCostsMonth: undefined,
    fixedCostsLoading: false,
    currentDay: new Date(0),
    dailyCashflow: [],
    chartYear: 2026,
    chartMonthIndex0: 9,
    counterpartySpend: [],
    counterpartyIncome: [],
    topExpenses: [],
    openTransactionDetail: jest.fn(),
    openTransactionsListForDay: jest.fn(),
    openTransactionsListForPayee: jest.fn(),
    openTransactionsListForPayer: jest.fn(),
    onManualAdd: jest.fn(),
    canGoPrevMonth: true,
    canGoNextMonth: false,
    goPrevMonth: jest.fn(),
    goNextMonth: jest.fn(),
    ...over,
  });
}

function render() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let tree!: Tree;
  act(() => {
    tree = create(
      <ThemeProvider>
        <AnalyticsScreen />
      </ThemeProvider>,
    );
  });
  return tree;
}

const texts = (tree: Tree) =>
  tree.root.findAll((n) => n.type === Text).map((n) => String(n.props.children));

beforeEach(() => {
  resetModel();
  mockOrder.value = { order: DEFAULT_ORDER, ready: true, commit: jest.fn() };
});

describe("AnalyticsScreen cards", () => {
  it("renders every card in the default order, then Arrange", () => {
    const tree = render();
    expect(texts(tree)).toEqual([
      "MONTH",
      "SUMMARY",
      "FIXED",
      "CASHFLOW",
      "PAYEES",
      "INCOME",
      "TOP",
      "COMPARE",
      "ARRANGE insights",
    ]);
    act(() => tree.unmount());
  });

  it("follows the user's order, the month switcher included", () => {
    mockOrder.value.order = [
      "insights.compare",
      "insights.topExpenses",
      "insights.month",
      "insights.summary",
      "insights.fixedCosts",
      "insights.cashflow",
      "insights.payees",
      "insights.income",
    ];
    const tree = render();
    expect(texts(tree)).toEqual([
      "COMPARE",
      "TOP",
      "MONTH",
      "SUMMARY",
      "FIXED",
      "CASHFLOW",
      "PAYEES",
      "INCOME",
      "ARRANGE insights",
    ]);
    act(() => tree.unmount());
  });

  describe("an empty month", () => {
    beforeEach(() => resetModel({ monthEmpty: true }));

    it("shows the empty card in the first chart card's slot and no other chart card", () => {
      const tree = render();
      expect(texts(tree)).toEqual(["MONTH", "SUMMARY", "EMPTY", "COMPARE", "ARRANGE insights"]);
      act(() => tree.unmount());
    });

    it("the slot is the first chart card in the user's order", () => {
      mockOrder.value.order = [
        "insights.month",
        "insights.payees",
        "insights.summary",
        "insights.fixedCosts",
        "insights.cashflow",
        "insights.income",
        "insights.compare",
        "insights.topExpenses",
      ];
      const tree = render();
      expect(texts(tree)).toEqual(["MONTH", "EMPTY", "SUMMARY", "COMPARE", "ARRANGE insights"]);
      act(() => tree.unmount());
    });

    it("works when every chart card was moved above the summary", () => {
      mockOrder.value.order = [
        "insights.topExpenses",
        "insights.income",
        "insights.month",
        "insights.summary",
        "insights.fixedCosts",
        "insights.cashflow",
        "insights.payees",
        "insights.compare",
      ];
      const tree = render();
      expect(texts(tree)).toEqual(["EMPTY", "MONTH", "SUMMARY", "COMPARE", "ARRANGE insights"]);
      act(() => tree.unmount());
    });
  });

  it("shows the charts placeholder in the first chart slot (and nothing for the others) until the charts are ready", () => {
    resetModel({ chartsReady: false });
    const tree = render();
    expect(texts(tree)).toEqual(["MONTH", "SUMMARY", "PLACEHOLDER", "COMPARE", "ARRANGE insights"]);
    act(() => tree.unmount());
  });

  it("an empty month wins over charts that are not ready", () => {
    resetModel({ monthEmpty: true, chartsReady: false });
    const tree = render();
    expect(texts(tree)).toContain("EMPTY");
    expect(texts(tree)).not.toContain("PLACEHOLDER");
    act(() => tree.unmount());
  });

  it("is a scroll view with the scroll and drag handlers kept", () => {
    const tree = render();
    const scroll = tree.root.findAll(
      (n) =>
        typeof n.props.onScroll === "function" &&
        typeof n.props.onScrollBeginDrag === "function" &&
        typeof n.props.onMomentumScrollEnd === "function",
    );
    expect(scroll.length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it("shows a loading state instead of the cards while a new device waits for its order", () => {
    mockOrder.value.ready = false;
    const tree = render();
    expect(texts(tree)).toEqual(["ARRANGE insights"]);
    act(() => tree.unmount());
  });
});
