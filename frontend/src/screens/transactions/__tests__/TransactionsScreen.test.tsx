
import {
  renderTree,
  runAct,
  textsOf,
  unmountTree,
  updateTree,
} from "@/features/brokeReport/components/__tests__/testHarness";
import { ThemeProvider } from "@/theme/ThemeProvider";

import TransactionsScreen from "../TransactionsScreen";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

// Counts how many times the toggle is mounted: a remount is what made the pill skip its animation.
const mockToggleMounts = jest.fn();
jest.mock("@/components/ui", () => {
  const { useEffect } = jest.requireActual("react");
  const { Text: RNText } = jest.requireActual("react-native");
  return {
    SlidingSegmentedControl: ({ value }: { value: string }) => {
      useEffect(() => {
        mockToggleMounts();
      }, []);
      return <RNText>{`toggle:${value}`}</RNText>;
    },
  };
});
jest.mock("@/components/shared", () => ({ CARD_SEGMENT_SHADOW_TOP_BLEED: 4 }));
jest.mock("@/features/transactions/components", () => {
  const { Text: RNText } = jest.requireActual("react-native");
  const part = (name: string) => {
    const Part = () => <RNText>{name}</RNText>;
    Part.displayName = name;
    return Part;
  };
  return {
    TransactionCalendarCard: part("calendar-card"),
    TransactionDayCardFooter: part("day-footer"),
    TransactionDayCardHeader: part("day-header"),
    TransactionDayCardPlaceholder: part("day-placeholder"),
    TransactionDayCardRow: part("day-row"),
    TransactionDayCardUpcomingRow: part("day-upcoming"),
  };
});
jest.mock("@shopify/flash-list", () => {
  const { View: RNView } = jest.requireActual("react-native");
  return {
    FlashList: ({ ListHeaderComponent }: { ListHeaderComponent: React.ReactNode }) => (
      <RNView>{ListHeaderComponent}</RNView>
    ),
  };
});
jest.mock("@/hooks/useTourScroller", () => ({
  useTourScroller: () => ({ onScroll: jest.fn() }),
}));
jest.mock("../TransactionsMonthList", () => {
  const { Text: RNText } = jest.requireActual("react-native");
  return { __esModule: true, default: () => <RNText>month-list</RNText> };
});

let mockViewMode: "list" | "calendar" = "list";
jest.mock("../useTransactionsScreenModel", () => ({
  useTransactionsScreenModel: () => ({
    canGoPrevMonth: true,
    canGoNextMonth: true,
    dayExpenseTotal: 0,
    dayIncomeTotal: 0,
    dayNetTotal: 0,
    emptyVariant: "empty-day",
    flashListData: [],
    goPrevMonth: jest.fn(),
    goNextMonth: jest.fn(),
    listCriteria: {},
    setListCriteria: jest.fn(),
    selectViewMode: jest.fn(),
    viewMode: mockViewMode,
    openTransactionDetail: jest.fn(),
    onManualAddForDay: jest.fn(),
    selectDay: jest.fn(),
    selectedDayKey: "2026-10-21",
    selectedDayTransactionCount: 0,
    selectedMonth: { year: 2026, monthIndex0: 9 },
    showMonthLoading: false,
    spendByDay: {},
    today: "2026-10-21",
    upcomingDayKeys: [],
    upcomingDayTotal: 0,
    upcomingExpenseTotal: 0,
    openUpcomingOccurrence: jest.fn(),
  }),
}));

function screen() {
  return (
    <ThemeProvider>
      <TransactionsScreen />
    </ThemeProvider>
  );
}

describe("TransactionsScreen view toggle", () => {
  beforeEach(() => {
    mockToggleMounts.mockClear();
  });

  it("keeps one toggle mounted across List and Calendar so its pill can animate", async () => {
    mockViewMode = "list";
    const tree = await renderTree(screen());
    expect(textsOf(tree)).toEqual(expect.arrayContaining(["toggle:list", "month-list"]));
    expect(mockToggleMounts).toHaveBeenCalledTimes(1);

    mockViewMode = "calendar";
    updateTree(tree, screen());
    runAct(() => undefined);
    const calendarTexts = textsOf(tree);
    expect(calendarTexts).toEqual(expect.arrayContaining(["toggle:calendar", "calendar-card"]));
    expect(calendarTexts).not.toContain("month-list");
    // Same instance: no second mount, and exactly one toggle on screen.
    expect(mockToggleMounts).toHaveBeenCalledTimes(1);
    expect(calendarTexts.filter((text) => text.startsWith("toggle:"))).toHaveLength(1);

    mockViewMode = "list";
    updateTree(tree, screen());
    expect(mockToggleMounts).toHaveBeenCalledTimes(1);
    unmountTree(tree);
  });
});
