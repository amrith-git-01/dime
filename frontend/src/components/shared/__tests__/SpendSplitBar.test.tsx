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

  it("draws a slim bar", () => {
    const node = render(1500, 500).root.findAllByProps({ testID: "spend-split-fixed" })[0];
    const style = StyleSheet.flatten(node.props.style as object) as { height: number };
    expect(style.height).toBeLessThanOrEqual(6);
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

  it("has no View link and no tappable legend", () => {
    const tree = render(1500, 500);
    expect(tree.root.findAllByProps({ testID: "spend-split-view" })).toHaveLength(0);
    expect(tree.root.findAllByProps({ onPress: expect.any(Function) })).toHaveLength(0);
  });

  it("draws one quiet legend line: dots, labels and amounts", () => {
    const tree = render(350, 9159);
    const legend = tree.root.findAllByProps({ testID: "spend-split-legend" })[0];
    expect(legend).toBeDefined();
    const text = JSON.stringify(tree.toJSON());
    expect(text).toContain("Recurring");
    expect(text).toContain(formatInrCompact(350));
    expect(text).toContain("Flexible");
    expect(text).toContain(formatInrCompact(9159));
    expect(text).not.toContain("Still to come");
  });

  describe("with a budget", () => {
    it("is the budget: segments are shares of it and the rest is the track", () => {
      const tree = render(1500, 500, { budget: 10000 });
      expect(grow(tree, "spend-split-fixed")).toBeCloseTo(15);
      expect(grow(tree, "spend-split-flexible")).toBeCloseTo(5);
      expect(grow(tree, "spend-split-track")).toBeCloseTo(80);
      expect(tree.root.findAllByProps({ testID: "spend-split-committed" })).toHaveLength(0);
    });

    it("draws the recurring still to come as a pale segment after the spend", () => {
      const tree = render(1500, 500, { budget: 10000, committed: 3000 });
      expect(grow(tree, "spend-split-committed")).toBeCloseTo(30);
      expect(grow(tree, "spend-split-track")).toBeCloseTo(50);
      const node = tree.root.findAllByProps({ testID: "spend-split-committed" })[0];
      const style = StyleSheet.flatten(node.props.style as object) as { opacity: number };
      expect(style.opacity).toBeLessThan(1);
      expect(JSON.stringify(tree.toJSON())).toContain("Still to come");
    });

    it("clamps the committed part to what is left of the budget", () => {
      const tree = render(1500, 500, { budget: 10000, committed: 50000 });
      expect(grow(tree, "spend-split-committed")).toBeCloseTo(80);
      expect(tree.root.findAllByProps({ testID: "spend-split-track" })).toHaveLength(0);
    });

    it("shows the bar even with no recurring spend, flexible only", () => {
      const tree = render(0, 500, { budget: 10000 });
      expect(tree.root.findAllByProps({ testID: "spend-split-fixed" })).toHaveLength(0);
      expect(grow(tree, "spend-split-flexible")).toBeCloseTo(5);
    });

    it("shows an empty track when nothing is spent yet", () => {
      const tree = render(0, 0, { budget: 10000 });
      expect(grow(tree, "spend-split-track")).toBeCloseTo(100);
    });

    it("over budget: the bar is full, segments scaled to the spend, no committed part", () => {
      const tree = render(3000, 9000, { budget: 10000, committed: 2000 });
      expect(grow(tree, "spend-split-fixed")).toBeCloseTo(25);
      expect(grow(tree, "spend-split-flexible")).toBeCloseTo(75);
      expect(tree.root.findAllByProps({ testID: "spend-split-track" })).toHaveLength(0);
      expect(tree.root.findAllByProps({ testID: "spend-split-committed" })).toHaveLength(0);
    });

    it("summarises everything for screen readers", () => {
      const tree = render(1500, 500, { budget: 10000, committed: 3000 });
      const labelled = tree.root.findAllByProps({
        accessibilityLabel: `Recurring ${formatInrCompact(1500)}, Flexible ${formatInrCompact(500)}, Still to come ${formatInrCompact(3000)}`,
      });
      expect(labelled.length).toBeGreaterThan(0);
    });
  });
});
