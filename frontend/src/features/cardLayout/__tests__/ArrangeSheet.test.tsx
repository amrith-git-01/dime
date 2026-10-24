import { AccessibilityInfo } from "react-native";

import { ThemeProvider } from "@/theme/ThemeProvider";

import { DEFAULT_CARD_ORDER } from "../cardIds";
import { ArrangeSheet } from "../components/ArrangeSheet";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerTickHaptic: jest.fn(() => Promise.resolve()),
  triggerConfirmHaptic: jest.fn(() => Promise.resolve()),
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }),
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  LinearTransition: { springify: () => ({ damping: () => ({ stiffness: () => ({ mass: () => ({}) }) }) }) },
}));
jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual("react-native");
  // Every builder method returns the same chainable object; detectors just render children.
  const chain: Record<string, unknown> = new Proxy(
    {},
    { get: () => () => chain },
  );
  return {
    Gesture: { Pan: () => chain, LongPress: () => chain },
    GestureDetector: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    GestureHandlerRootView: View,
  };
});

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
  toJSON: () => unknown;
};

const HOME = DEFAULT_CARD_ORDER.home;
const REVERSED = [...HOME].reverse();

function render(props: Partial<React.ComponentProps<typeof ArrangeSheet>> = {}) {
  const onCancel = jest.fn();
  const onDone = jest.fn();
  let tree!: Tree;
  act(() => {
    tree = create(
      <ThemeProvider>
        <ArrangeSheet
          visible
          screen="home"
          order={HOME}
          onCancel={onCancel}
          onDone={onDone}
          {...props}
        />
      </ThemeProvider>,
    );
  });
  return { tree, onCancel, onDone };
}

/** The pressable (or row) carrying this accessibility label and a handler. */
function byLabel(tree: Tree, label: string, handler: "onPress" | "onAccessibilityAction") {
  const node = tree.root
    .findAll((n) => n.props.accessibilityLabel === label && typeof n.props[handler] === "function")
    .at(0);
  if (!node) {
    throw new Error(`No ${handler} node labelled "${label}"`);
  }
  return node;
}

const press = (tree: Tree, label: string) =>
  act(() => void (byLabel(tree, label, "onPress").props.onPress as () => void)());

function rowLabels(tree: Tree): string[] {
  const labels = tree.root
    .findAll((n) => typeof n.props.onAccessibilityAction === "function")
    .map((n) => n.props.accessibilityLabel as string);
  return [...new Set(labels)];
}

function moveRow(tree: Tree, label: string, name: "moveUp" | "moveDown") {
  const row = byLabel(tree, label, "onAccessibilityAction");
  act(() =>
    void (row.props.onAccessibilityAction as (e: unknown) => void)({
      nativeEvent: { actionName: name },
    }),
  );
}

let announce: jest.SpyInstance;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
});
afterEach(() => announce.mockRestore());

describe("ArrangeSheet", () => {
  it("is titled for the screen, with Cancel, Done and Reset to default", () => {
    const { tree } = render();
    expect(JSON.stringify(tree.toJSON())).toContain("Arrange Home");
    expect(byLabel(tree, "Cancel", "onPress")).toBeDefined();
    expect(byLabel(tree, "Done", "onPress")).toBeDefined();
    expect(byLabel(tree, "Reset to default", "onPress")).toBeDefined();
    act(() => tree.unmount());
  });

  it("lists every card of the screen in the current order, with its position", () => {
    const { tree } = render({ order: REVERSED });
    // Rows are fixed in the default order and slide to their slot; the label says where they are.
    expect(rowLabels(tree)).toEqual([
      "This month, position 6 of 6",
      "Get started, position 5 of 6",
      "Month stats, position 4 of 6",
      "Upcoming, position 3 of 6",
      "Top categories, position 2 of 6",
      "Recent transactions, position 1 of 6",
    ]);
    act(() => tree.unmount());
  });

  it("gives each row Move up and Move down actions and a labelled handle", () => {
    const { tree } = render();
    const row = byLabel(tree, "This month, position 1 of 6", "onAccessibilityAction");
    expect(row.props.accessibilityActions).toEqual([
      { name: "moveUp", label: "Move up" },
      { name: "moveDown", label: "Move down" },
    ]);
    expect(
      tree.root.findAll((n) => n.props.accessibilityLabel === "Drag to reorder This month").length,
    ).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it("Move down reorders, announces the new position and Done hands the order over", () => {
    const { tree, onDone, onCancel } = render();
    moveRow(tree, "This month, position 1 of 6", "moveDown");
    expect(announce).toHaveBeenCalledWith("This month, position 2 of 6");
    expect(rowLabels(tree)).toContain("This month, position 2 of 6");
    expect(rowLabels(tree)).toContain("Get started, position 1 of 6");
    press(tree, "Done");
    expect(onDone).toHaveBeenCalledWith([
      "home.getStarted",
      "home.month",
      "home.stats",
      "home.upcoming",
      "home.categories",
      "home.recent",
    ]);
    expect(onCancel).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("Move up works and stops at the top", () => {
    const { tree, onDone } = render();
    moveRow(tree, "Month stats, position 3 of 6", "moveUp");
    expect(announce).toHaveBeenLastCalledWith("Month stats, position 2 of 6");
    moveRow(tree, "Month stats, position 2 of 6", "moveUp");
    moveRow(tree, "Month stats, position 1 of 6", "moveUp");
    expect(announce).toHaveBeenLastCalledWith("Month stats, position 1 of 6");
    press(tree, "Done");
    expect((onDone.mock.calls[0][0] as string[])[0]).toBe("home.stats");
    act(() => tree.unmount());
  });

  it("Cancel, the backdrop and Android back discard without saving", () => {
    const { tree, onDone, onCancel } = render();
    moveRow(tree, "This month, position 1 of 6", "moveDown");
    press(tree, "Cancel");
    press(tree, "Close without saving");
    const modal = tree.root.findAll((n) => typeof n.props.onRequestClose === "function")[0];
    act(() => void (modal.props.onRequestClose as () => void)());
    expect(onCancel).toHaveBeenCalledTimes(3);
    expect(onDone).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("Reset to default puts the default order back in the list and applies on Done", () => {
    const { tree, onDone } = render({ order: REVERSED });
    press(tree, "Reset to default");
    expect(rowLabels(tree)).toContain("This month, position 1 of 6");
    expect(onDone).not.toHaveBeenCalled();
    press(tree, "Done");
    expect(onDone).toHaveBeenCalledWith([...HOME]);
    act(() => tree.unmount());
  });

  it("Reset is disabled while the list is already the default", () => {
    const { tree } = render();
    const reset = byLabel(tree, "Reset to default", "onPress");
    expect(reset.props.disabled).toBe(true);
    act(() => tree.unmount());
  });

  it("starts from a saved order that is missing a card by slotting the new one in", () => {
    const { tree } = render({ order: ["home.recent", "home.month", "home.stats"] });
    expect(rowLabels(tree)).toContain("Recent transactions, position 1 of 6");
    expect(rowLabels(tree)).toContain("Get started, position 3 of 6");
    act(() => tree.unmount());
  });

  it("uses the screen's own title and cards for Budgets and Insights", () => {
    const budgets = render({ screen: "budgets", order: DEFAULT_CARD_ORDER.budgets });
    expect(rowLabels(budgets.tree)).toEqual([
      "Budget summary, position 1 of 3",
      "Recurring, position 2 of 3",
      "Category budgets, position 3 of 3",
    ]);
    expect(JSON.stringify(budgets.tree.toJSON())).toContain("Arrange Budgets");
    act(() => budgets.tree.unmount());
    const insights = render({ screen: "insights", order: DEFAULT_CARD_ORDER.insights });
    expect(rowLabels(insights.tree)).toHaveLength(8);
    expect(rowLabels(insights.tree)).toContain("Who paid you, position 6 of 8");
    expect(JSON.stringify(insights.tree.toJSON())).toContain("Arrange Insights");
    act(() => insights.tree.unmount());
  });
});
