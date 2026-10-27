import { Text } from "react-native";

import { ThemeProvider } from "@/theme/ThemeProvider";

import { HomeContent } from "../HomeContent";
import type { HomeBentoContentProps } from "../bento/types";

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
  "home.month",
  "home.getStarted",
  "home.stats",
  "home.upcoming",
  "home.categories",
  "home.recent",
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

jest.mock("../HeroMonthCard", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { HeroMonthCard: () => <T>HERO</T> };
});
jest.mock("../HomeCategoriesSection", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { HomeCategoriesSection: () => <T>CATEGORIES</T> };
});
jest.mock("../HomeRecentSection", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { HomeRecentSection: () => <T>RECENT</T> };
});
jest.mock("../HomeUpcomingSection", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { HomeUpcomingSection: () => <T>UPCOMING</T> };
});
jest.mock("../MonthStatRow", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { MonthStatRow: () => <T>STATS</T> };
});
jest.mock("@/features/brokeReport/components", () => ({
  ReportBanner: () => null,
  PastReportsShelf: () => null,
}));
jest.mock("@/features/onboarding/components", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { GetStartedCard: () => <T>GET STARTED</T> };
});
jest.mock("@/features/outbox/components/PendingChip", () => {
  const { Text: T } = jest.requireActual("react-native");
  return { PendingChip: () => <T>PENDING</T> };
});
const mockPending = { items: [] as unknown[] };
jest.mock("@/features/outbox/hooks/usePendingTransactions", () => ({
  usePendingTransactions: () => mockPending,
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

function render(over: Partial<HomeBentoContentProps> = {}) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const props = {
    isPending: false,
    isError: false,
    updatedLabel: null,
    ...over,
  } as unknown as HomeBentoContentProps;
  let tree!: Tree;
  act(() => {
    tree = create(
      <ThemeProvider>
        <HomeContent {...props} />
      </ThemeProvider>,
    );
  });
  return tree;
}

const texts = (tree: Tree) =>
  tree.root.findAll((n) => n.type === Text).map((n) => String(n.props.children));

beforeEach(() => {
  mockOrder.value = { order: DEFAULT_ORDER, ready: true, commit: jest.fn() };
  mockPending.items = [];
});

describe("HomeContent cards", () => {
  it("renders today's layout by default, with Arrange at the end", () => {
    const tree = render();
    expect(texts(tree)).toEqual([
      "HERO",
      "GET STARTED",
      "STATS",
      "UPCOMING",
      "CATEGORIES",
      "RECENT",
      "ARRANGE home",
    ]);
    act(() => tree.unmount());
  });

  it("follows the user's order, hero included", () => {
    mockOrder.value.order = [
      "home.recent",
      "home.stats",
      "home.month",
      "home.upcoming",
      "home.categories",
      "home.getStarted",
    ];
    const tree = render();
    expect(texts(tree)).toEqual([
      "RECENT",
      "STATS",
      "HERO",
      "UPCOMING",
      "CATEGORIES",
      "GET STARTED",
      "ARRANGE home",
    ]);
    act(() => tree.unmount());
  });

  it("the sync status travels with the hero card", () => {
    mockPending.items = [{ id: "1" }];
    mockOrder.value.order = ["home.stats", "home.month", "home.recent"];
    const tree = render({ updatedLabel: "Updated just now" });
    expect(texts(tree).slice(0, 4)).toEqual(["STATS", "HERO", "PENDING", "Updated just now"]);
    act(() => tree.unmount());
  });

  it("shows the sync status only when there is something to say", () => {
    const tree = render();
    expect(texts(tree)).not.toContain("PENDING");
    act(() => tree.unmount());
  });

  it("keeps the error line above everything", () => {
    mockOrder.value.order = ["home.recent", "home.month"];
    const tree = render({ isError: true });
    expect(texts(tree)[0]).toBe("Could not load spending data.");
    act(() => tree.unmount());
  });

  it("shows a loading state instead of the cards while a new device waits for its order", () => {
    mockOrder.value.ready = false;
    const tree = render();
    expect(texts(tree)).toEqual(["ARRANGE home"]);
    act(() => tree.unmount());
  });
});
