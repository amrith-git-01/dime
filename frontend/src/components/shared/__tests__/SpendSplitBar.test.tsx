import { StyleSheet } from "react-native";

import { ThemeProvider } from "@/theme/ThemeProvider";
import { formatInrCompact } from "@/utils/currency";

import { SpendSplitBar, type SpendSplitBarProps } from "../SpendSplitBar";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => {
    toJSON: () => unknown;
    root: {
      findAllByProps: (props: object) => {
        props: Record<string, unknown>;
      }[];
    };
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

function render(
  fixed: number,
  flexible: number,
  extra: Partial<SpendSplitBarProps> = {},
) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <ThemeProvider>
        <SpendSplitBar fixed={fixed} flexible={flexible} {...extra} />
      </ThemeProvider>,
    );
  });
  return tree;
}

function grow(tree: ReturnType<typeof create>, testID: string): number {
  const node = tree.root.findAllByProps({ testID })[0];
  return (StyleSheet.flatten(node.props.style as object) as { flexGrow: number }).flexGrow;
}

function press(tree: ReturnType<typeof create>, testID: string) {
  const node = tree.root.findAllByProps({ testID })[0];
  act(() => {
    (node.props.onPress as () => void)();
  });
}

describe("SpendSplitBar", () => {
  it("renders nothing when there is no recurring spend", () => {
    expect(render(0, 500).root.findAllByProps({ testID: "spend-split-fixed" })).toHaveLength(0);
    expect(render(0, 500).toJSON()).toBeNull();
  });

  it("renders nothing when the total is zero", () => {
    expect(render(0, 0).toJSON()).toBeNull();
  });

  it("sizes the segments in proportion to the amounts", () => {
    const tree = render(1500, 500);
    expect(grow(tree, "spend-split-fixed")).toBeCloseTo(75);
    expect(grow(tree, "spend-split-flexible")).toBeCloseTo(25);
  });

  it("draws a lean bar", () => {
    const node = render(1500, 500).root.findAllByProps({ testID: "spend-split-fixed" })[0];
    const style = StyleSheet.flatten(node.props.style as object) as { height: number };
    expect(style.height).toBeLessThanOrEqual(4);
  });

  it("describes the split for screen readers", () => {
    const tree = render(1500, 500);
    const labelled = tree.root.findAllByProps({
      accessibilityLabel: `Recurring ${formatInrCompact(1500)}, Flexible ${formatInrCompact(500)}`,
    });
    expect(labelled.length).toBeGreaterThan(0);
  });

  it("drops the flexible segment when nothing is flexible", () => {
    const tree = render(900, 0);
    expect(grow(tree, "spend-split-fixed")).toBeCloseTo(100);
    expect(tree.root.findAllByProps({ testID: "spend-split-flexible" })).toHaveLength(0);
  });

  it("shows no View link or tappable legend by default", () => {
    const tree = render(1500, 500);
    expect(tree.root.findAllByProps({ testID: "spend-split-view" })).toHaveLength(0);
    const legend = tree.root.findAllByProps({ testID: "spend-split-legend-recurring" })[0];
    expect(legend.props.onPress).toBeUndefined();
  });

  it("calls onView from the View link", () => {
    const onView = jest.fn();
    const tree = render(1500, 500, { onView });
    press(tree, "spend-split-view");
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it("calls onPressKind with the tapped legend kind", () => {
    const onPressKind = jest.fn();
    const tree = render(1500, 500, { onPressKind });
    press(tree, "spend-split-legend-recurring");
    press(tree, "spend-split-legend-flexible");
    expect(onPressKind).toHaveBeenNthCalledWith(1, "recurring");
    expect(onPressKind).toHaveBeenNthCalledWith(2, "flexible");
  });
});
