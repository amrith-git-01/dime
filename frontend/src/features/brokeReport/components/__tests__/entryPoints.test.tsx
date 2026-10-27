import { ThemeProvider } from "@/theme/ThemeProvider";

import type { ReportListItem } from "../../types";
import { PastReportsShelf, ReportBanner, ReportsListEditor } from "..";
import {
  press,
  pressables,
  pressText,
  renderTree,
  textsOf,
  unmountTree,
} from "./testHarness";

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
  triggerTickHaptic: jest.fn(() => Promise.resolve()),
  triggerConfirmHaptic: jest.fn(() => Promise.resolve()),
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  LinearTransition: {
    springify: () => ({ damping: () => ({ stiffness: () => ({ mass: () => ({}) }) }) }),
  },
}));

// The barrel also holds the player, which brings in the share helper's native pieces.
jest.mock("@shopify/react-native-skia", () => ({
  ImageFormat: { PNG: 4 },
  makeImageFromView: jest.fn(),
}));
jest.mock("expo-file-system/legacy", () => ({ cacheDirectory: null, writeAsStringAsync: jest.fn() }));
jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual("react-native");
  const chain: Record<string, unknown> = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain, LongPress: () => chain, Tap: () => chain, Simultaneous: () => chain, Exclusive: () => chain },
    GestureDetector: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

const mockOpen = jest.fn();
jest.mock("../../hooks/useOpenReport", () => ({ useOpenReport: () => mockOpen }));

const mockBanner = {
  value: { periodKey: null as string | null, monthLabel: null as string | null, dismiss: jest.fn() },
};
jest.mock("../../hooks/useReportBanner", () => ({ useReportBanner: () => mockBanner.value }));

const mockList = { value: { data: undefined as ReportListItem[] | undefined } };
jest.mock("../../hooks/useReportsList", () => ({ useReportsList: () => mockList.value }));

function item(period_key: string, viewed = true): ReportListItem {
  const [year, month] = period_key.split("-").map(Number);
  return { period_key, year, month, debit_count: 12, viewed };
}

const wrap = (element: React.ReactElement) => <ThemeProvider>{element}</ThemeProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  mockBanner.value = { periodKey: null, monthLabel: null, dismiss: jest.fn() };
  mockList.value = { data: undefined };
});

describe("ReportBanner", () => {
  it("renders nothing when no report is on offer", async () => {
    const tree = await renderTree(wrap(<ReportBanner />));
    expect(tree.toJSON()).toBeNull();
    unmountTree(tree);
  });

  it("offers the month's report, opens it and can be dismissed", async () => {
    mockBanner.value = { periodKey: "2026-10", monthLabel: "October", dismiss: jest.fn() };
    const tree = await renderTree(wrap(<ReportBanner />));
    expect(textsOf(tree)).toEqual([
      "Your October Broke Report is ready",
      "See how your wallet did",
    ]);
    press(tree, "Your October Broke Report is ready. See how your wallet did.");
    expect(mockOpen).toHaveBeenCalledWith("2026-10");
    press(tree, "Dismiss the October Broke Report banner");
    expect(mockBanner.value.dismiss).toHaveBeenCalledTimes(1);
    unmountTree(tree);
  });
});

describe("PastReportsShelf", () => {
  it("is hidden while there are no reports", async () => {
    const tree = await renderTree(wrap(<PastReportsShelf />));
    expect(tree.toJSON()).toBeNull();
    mockList.value = { data: [] };
    const empty = await renderTree(wrap(<PastReportsShelf />));
    expect(empty.toJSON()).toBeNull();
    unmountTree(tree);
    unmountTree(empty);
  });

  it("shows the last six months, marks unviewed ones, and opens a tile", async () => {
    mockList.value = {
      data: [
        item("2026-10", false),
        item("2026-09"),
        item("2026-08"),
        item("2026-07"),
        item("2026-06"),
        item("2026-05"),
        item("2026-04"),
      ],
    };
    const tree = await renderTree(wrap(<PastReportsShelf />));
    expect(textsOf(tree)).toContain("Past reports");
    expect(textsOf(tree).filter((t) => /^[A-Z][a-z]{2}$/.test(t))).toEqual([
      "Oct",
      "Sep",
      "Aug",
      "Jul",
      "Jun",
      "May",
    ]);
    expect(pressables(tree, "October 2026 Broke Report, new")).not.toHaveLength(0);
    expect(pressables(tree, "September 2026 Broke Report")).not.toHaveLength(0);
    expect(pressables(tree, "April 2026 Broke Report")).toHaveLength(0);
    press(tree, "September 2026 Broke Report");
    expect(mockOpen).toHaveBeenCalledWith("2026-09");
    unmountTree(tree);
  });
});

describe("ReportsListEditor", () => {
  const base = {
    items: [] as ReportListItem[],
    isLoading: false,
    isError: false,
    onRetry: jest.fn(),
    onOpen: jest.fn(),
    onOpenSample: jest.fn(),
  };

  it("offers a sample when there are no reports yet", async () => {
    const tree = await renderTree(wrap(<ReportsListEditor {...base} />));
    expect(textsOf(tree)).toContain("Your first Broke Report lands on the 1st");
    expect(textsOf(tree)).toContain("See a sample");
    pressText(tree, "See a sample");
    expect(base.onOpenSample).toHaveBeenCalledTimes(1);
    unmountTree(tree);
  });

  it("lists every report newest first with an unviewed mark, and keeps the sample reachable", async () => {
    const tree = await renderTree(
      wrap(<ReportsListEditor {...base} items={[item("2026-10", false), item("2026-09")]} />),
    );
    const texts = textsOf(tree);
    expect(texts.indexOf("October 2026")).toBeGreaterThan(-1);
    expect(texts.indexOf("October 2026")).toBeLessThan(texts.indexOf("September 2026"));
    expect(texts).toContain("12 payments");
    press(tree, "October 2026 Broke Report, 12 payments, new");
    expect(base.onOpen).toHaveBeenCalledWith("2026-10");
    expect(pressables(tree, "September 2026 Broke Report, 12 payments")).not.toHaveLength(0);
    pressText(tree, "See a sample");
    expect(base.onOpenSample).toHaveBeenCalled();
    unmountTree(tree);
  });

  it("shows a retry when the list cannot load", async () => {
    const tree = await renderTree(wrap(<ReportsListEditor {...base} isError />));
    expect(textsOf(tree)).toContain("Couldn't load your reports");
    pressText(tree, "Retry");
    expect(base.onRetry).toHaveBeenCalledTimes(1);
    unmountTree(tree);
  });

  it("shows a skeleton while loading", async () => {
    const tree = await renderTree(wrap(<ReportsListEditor {...base} isLoading />));
    expect(textsOf(tree)).toEqual([]);
    unmountTree(tree);
  });
});
