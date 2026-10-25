import { Text } from "react-native";

import { ThemeProvider } from "@/theme/ThemeProvider";

import { useCardSlotEmpty } from "../components/CardSlot";
import { OrderedCards } from "../components/OrderedCards";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  LinearTransition: {
    springify: () => ({ damping: () => ({ stiffness: () => ({ mass: () => "transition" }) }) }),
  },
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => Tree;
};
/* eslint-enable @typescript-eslint/no-require-imports */

type Node = { props: Record<string, unknown>; type: unknown; children: unknown[] };
type Tree = {
  root: { findAll: (predicate: (node: Node) => boolean) => Node[] };
  toJSON: () => unknown;
  unmount: () => void;
};

function Card({ label, empty = false }: { label: string; empty?: boolean }) {
  useCardSlotEmpty(empty);
  return empty ? null : <Text>{label}</Text>;
}

function render(element: React.ReactElement) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let tree!: Tree;
  act(() => {
    tree = create(<ThemeProvider>{element}</ThemeProvider>);
  });
  return tree;
}

/** The text of every <Text>, top to bottom. */
function texts(tree: Tree): string[] {
  return tree.root
    .findAll((n) => n.type === Text)
    .map((n) => String(n.props.children));
}

describe("OrderedCards", () => {
  it("renders the cards in the given order", () => {
    const tree = render(
      <OrderedCards
        order={["c", "a", "b"]}
        cards={{ a: <Card label="A" />, b: <Card label="B" />, c: <Card label="C" /> }}
      />,
    );
    expect(texts(tree)).toEqual(["C", "A", "B"]);
    act(() => tree.unmount());
  });

  it("skips cards the screen gave nothing for, and ids not in the order", () => {
    const tree = render(
      <OrderedCards
        order={["a", "b", "c"]}
        cards={{ a: <Card label="A" />, b: null, d: <Card label="D" /> } as never}
      />,
    );
    expect(texts(tree)).toEqual(["A"]);
    act(() => tree.unmount());
  });

  it("follows a new order", () => {
    const tree = render(
      <OrderedCards order={["a", "b"]} cards={{ a: <Card label="A" />, b: <Card label="B" /> }} />,
    );
    act(() => {
      (tree as unknown as { update: (e: React.ReactElement) => void }).update(
        <ThemeProvider>
          <OrderedCards order={["b", "a"]} cards={{ a: <Card label="A" />, b: <Card label="B" /> }} />
        </ThemeProvider>,
      );
    });
    expect(texts(tree)).toEqual(["B", "A"]);
    act(() => tree.unmount());
  });

  it("collapses the slot of a card that renders nothing, so the gap does not leave a hole", () => {
    const tree = render(
      <OrderedCards
        order={["a", "b"]}
        cards={{ a: <Card label="A" empty />, b: <Card label="B" /> }}
      />,
    );
    const hidden = tree.root.findAll(
      (n) => JSON.stringify(n.props.style ?? null).includes('"display":"none"'),
    );
    expect(hidden.length).toBeGreaterThan(0);
    expect(texts(tree)).toEqual(["B"]);
    act(() => tree.unmount());
  });

  it("shows a loading state instead of the cards until ready", () => {
    const tree = render(
      <OrderedCards order={["a"]} cards={{ a: <Card label="A" /> }} ready={false} />,
    );
    expect(texts(tree)).toEqual([]);
    act(() => tree.unmount());
  });

  it("puts the layout transition on each card wrapper", () => {
    const tree = render(
      <OrderedCards order={["a"]} cards={{ a: <Card label="A" /> }} />,
    );
    // Reduced motion resolves asynchronously (off by default), so the wrapper animates at first.
    const animated = tree.root.findAll((n) => n.props.layout === "transition");
    expect(animated.length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });

  it("reports each card wrapper's layout", () => {
    const onCardLayout = jest.fn();
    const tree = render(
      <OrderedCards
        order={["a"]}
        cards={{ a: <Card label="A" /> }}
        onCardLayout={onCardLayout}
      />,
    );
    const wrapper = tree.root.findAll((n) => typeof n.props.onLayout === "function")[0];
    const event = { nativeEvent: { layout: { x: 0, y: 120, width: 300, height: 80 } } };
    (wrapper.props.onLayout as (e: unknown) => void)(event);
    expect(onCardLayout).toHaveBeenCalledWith("a", event);
    act(() => tree.unmount());
  });
});
