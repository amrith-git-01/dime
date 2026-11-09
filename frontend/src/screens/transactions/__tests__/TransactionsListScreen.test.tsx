import {
  renderTree,
  runAct,
  textsOf,
  unmountTree,
  updateTree,
} from "@/features/brokeReport/components/__tests__/testHarness";
import { ThemeProvider } from "@/theme/ThemeProvider";

import TransactionsListScreen from "../TransactionsListScreen";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/useTourTarget", () => ({ useTourTarget: () => ({ testID: "tour-box" }) }));

const mockScrollToOffset = jest.fn();
jest.mock("@shopify/flash-list", () => {
  const { forwardRef, useImperativeHandle } = jest.requireActual("react");
  const { Text: RNText, View: RNView } = jest.requireActual("react-native");
  return {
    FlashList: forwardRef(function MockFlashList(
      props: {
        data: unknown[];
        ListHeaderComponent: React.ReactNode;
        ListEmptyComponent: React.ReactNode;
      },
      ref: React.Ref<unknown>,
    ) {
      useImperativeHandle(ref, () => ({ scrollToOffset: mockScrollToOffset }));
      return (
        <RNView>
          {props.ListHeaderComponent}
          <RNText>{`rows:${props.data.length}`}</RNText>
          {props.data.length === 0 ? props.ListEmptyComponent : null}
        </RNView>
      );
    }),
  };
});
jest.mock("@/features/transactions/components", () => {
  const { Text: RNText } = jest.requireActual("react-native");
  const part = (name: string) => {
    const Part = () => <RNText>{name}</RNText>;
    Part.displayName = name;
    return Part;
  };
  return {
    DayHeader: part("day-header"),
    TransactionListRowView: part("tx-row"),
    transactionListItemType: () => "row",
    transactionListKeyExtractor: (_: unknown, index: number) => String(index),
  };
});
jest.mock("../CategoryMonthSection", () => {
  const { Text: RNText } = jest.requireActual("react-native");
  return {
    CategoryMonthSection: ({ card }: { card: { monthLabel: string } }) => (
      <RNText>{`card:${card.monthLabel}`}</RNText>
    ),
  };
});

type Model = Record<string, unknown>;
let mockModel: Model;
jest.mock("../useTransactionsListScreenModel", () => ({
  useTransactionsListScreenModel: () => mockModel,
}));

function model(over: Model = {}): Model {
  return {
    categoryCard: null,
    listItems: [{ kind: "row" }, { kind: "row" }],
    filter: "category",
    direction: "debit",
    usesRange: false,
    isEmpty: false,
    isError: false,
    hasLoadedRows: true,
    isRetrying: false,
    retry: jest.fn(),
    openTransactionDetail: jest.fn(),
    openManualAddForDay: jest.fn(),
    showInitialLoading: false,
    showLoadingMore: false,
    loadMore: jest.fn(),
    subtitle: "2 transactions · November 2026",
    recurringName: "",
    ...over,
  };
}

const card = (monthLabel: string, monthKey: string) => ({ monthLabel, monthKey });

async function render() {
  return renderTree(
    <ThemeProvider>
      <TransactionsListScreen />
    </ThemeProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

describe("TransactionsListScreen", () => {
  it("puts the month card above the subtitle and the rows for a category", async () => {
    mockModel = model({ categoryCard: card("November 2026", "2026-10") });
    const tree = await render();
    const texts = textsOf(tree);
    expect(texts).toEqual(["card:November 2026", "2 transactions · November 2026", "rows:2"]);
    unmountTree(tree);
  });

  it("has no card for other lists", async () => {
    mockModel = model({ filter: "payee" });
    const tree = await render();
    expect(textsOf(tree).some((text) => text.startsWith("card:"))).toBe(false);
    expect(textsOf(tree)).toContain("rows:2");
    unmountTree(tree);
  });

  it("keeps the card while the next month loads, with the spinner under it", async () => {
    mockModel = model({
      categoryCard: card("October 2026", "2026-9"),
      listItems: [],
      showInitialLoading: true,
      hasLoadedRows: false,
    });
    const tree = await render();
    const texts = textsOf(tree);
    expect(texts).toContain("card:October 2026");
    expect(texts).toContain("rows:0");
    expect(texts).not.toContain("2 transactions · November 2026");
    unmountTree(tree);
  });

  it("keeps the card over an empty month", async () => {
    mockModel = model({
      categoryCard: card("October 2026", "2026-9"),
      listItems: [],
      isEmpty: true,
      subtitle: "0 transactions · October 2026",
    });
    const tree = await render();
    const texts = textsOf(tree);
    expect(texts).toContain("card:October 2026");
    expect(texts).toContain("0 transactions · October 2026");
    unmountTree(tree);
  });

  it("keeps the card over a failed load", async () => {
    mockModel = model({
      categoryCard: card("October 2026", "2026-9"),
      listItems: [],
      isError: true,
      hasLoadedRows: false,
    });
    const tree = await render();
    expect(textsOf(tree)).toContain("card:October 2026");
    unmountTree(tree);
  });

  it("replaces the whole screen with the spinner or message for a list without a card", async () => {
    mockModel = model({ filter: "payee", listItems: [], showInitialLoading: true, hasLoadedRows: false });
    const tree = await render();
    expect(textsOf(tree)).toEqual([]);
    unmountTree(tree);
  });

  it("registers the tour box only once the card has laid out, below it", async () => {
    mockModel = model({ categoryCard: card("November 2026", "2026-10") });
    const tree = await render();
    const tourBoxes = () => tree.root.findAll((node) => node.props.testID === "tour-box" && node.type === "View");
    expect(tourBoxes()).toHaveLength(0);

    const [cardWrapper] = tree.root.findAll(
      (node) => node.type === "View" && typeof node.props.onLayout === "function",
    );
    await runAct(() => {
      (cardWrapper.props.onLayout as (event: unknown) => void)({
        nativeEvent: { layout: { height: 250 } },
      });
    });
    const [box] = tourBoxes();
    expect(box).toBeDefined();
    expect(JSON.stringify(box.props.style)).toContain(`"top":${28 + 250}`);
    unmountTree(tree);
  });

  it("registers the tour box straight away for lists without a card", async () => {
    mockModel = model({ filter: "payee" });
    const tree = await render();
    expect(
      tree.root.findAll((node) => node.props.testID === "tour-box" && node.type === "View"),
    ).toHaveLength(1);
    unmountTree(tree);
  });

  it("scrolls to the top when the month changes, not on other updates", async () => {
    mockModel = model({ categoryCard: card("November 2026", "2026-10") });
    const tree = await render();
    mockScrollToOffset.mockClear();

    mockModel = model({ categoryCard: card("November 2026", "2026-10"), subtitle: "3 transactions · November 2026" });
    updateTree(
      tree,
      <ThemeProvider>
        <TransactionsListScreen />
      </ThemeProvider>,
    );
    expect(mockScrollToOffset).not.toHaveBeenCalled();

    mockModel = model({ categoryCard: card("October 2026", "2026-9") });
    await runAct(() => {
      updateTree(
        tree,
        <ThemeProvider>
          <TransactionsListScreen />
        </ThemeProvider>,
      );
    });
    expect(mockScrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
    unmountTree(tree);
  });
});
