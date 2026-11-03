import { StyleSheet } from "react-native";

import { lightColors } from "@/theme/palettes";
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

function allText(tree: ReturnType<typeof create>): string {
  return JSON.stringify(tree.toJSON());
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

  it("draws one row of columns: dot, label and amount, with two columns and no budget", () => {
    const tree = render(350, 9159);
    expect(tree.root.findAllByProps({ testID: "spend-split-breakdown" })[0]).toBeDefined();
    const text = allText(tree);
    expect(text).toContain("Recurring");
    expect(text).toContain(formatInrCompact(350));
    expect(text).toContain("Flexible");
    expect(text).toContain(formatInrCompact(9159));
    expect(text).not.toContain("Left of");
    expect(text).not.toContain("Over by");
    expect(text).not.toContain("due");
    expect(text).not.toContain("Still to come");
  });

  it("can hide the breakdown and keep the bar", () => {
    const tree = render(350, 9159, { showBreakdown: false });
    expect(tree.root.findAllByProps({ testID: "spend-split-breakdown" })).toHaveLength(0);
    expect(grow(tree, "spend-split-fixed")).toBeGreaterThan(0);
  });

  it("without a budget, names the recurring still to come in a caption but draws no pale segment", () => {
    const tree = render(350, 9159, { committed: 2000 });
    expect(allText(tree)).toContain(`+${formatInrCompact(2000)} due`);
    expect(tree.root.findAllByProps({ testID: "spend-split-committed" })).toHaveLength(0);
  });

  it("without a budget and without recurring spend, still shows what is due", () => {
    const tree = render(0, 500, { committed: 2000 });
    const text = allText(tree);
    expect(text).toContain(`+${formatInrCompact(2000)} due`);
    expect(tree.root.findAllByProps({ testID: "spend-split-fixed" })).toHaveLength(0);
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
      expect(allText(tree)).toContain(`+${formatInrCompact(3000)} due`);
    });

    it("adds a third column: the label names the budget and the amount is what is left", () => {
      const tree = render(1500, 500, { budget: 10000 });
      const text = allText(tree);
      expect(text).toContain(`Left of ${formatInrCompact(10000)}`);
      expect(text).toContain(formatInrCompact(8000));
      expect(text).not.toContain("Over by");
      expect(text).not.toContain("due");
    });

    it("draws the left amount in the accent text colour", () => {
      const tree = render(1500, 500, { budget: 10000 });
      const style = StyleSheet.flatten(
        tree.root.findAllByProps({ children: formatInrCompact(8000) })[0].props.style as object,
      ) as { color: string };
      expect(style.color).toBe(lightColors.accentText);
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
      const text = allText(tree);
      expect(text).toContain("Over by");
      expect(text).toContain(formatInrCompact(2000));
      expect(text).not.toContain("Left of");
    });

    it("over budget: the overage is drawn in the danger colour", () => {
      const tree = render(3000, 9000, { budget: 10000 });
      const style = StyleSheet.flatten(
        tree.root.findAllByProps({ children: formatInrCompact(2000) })[0].props.style as object,
      ) as { color: string };
      expect(style.color).toBe(lightColors.danger);
    });

    it("spending exactly the budget is not over: nothing left, a full bar and the normal colour", () => {
      const tree = render(6000, 4000, { budget: 10000, committed: 2000 });
      const text = allText(tree);
      expect(text).toContain(`Left of ${formatInrCompact(10000)}`);
      expect(text).not.toContain("Over by");
      expect(grow(tree, "spend-split-fixed")).toBeCloseTo(60);
      expect(grow(tree, "spend-split-flexible")).toBeCloseTo(40);
      expect(tree.root.findAllByProps({ testID: "spend-split-track" })).toHaveLength(0);
      expect(tree.root.findAllByProps({ testID: "spend-split-committed" })).toHaveLength(0);
      const style = StyleSheet.flatten(
        tree.root.findAllByProps({ children: formatInrCompact(0) })[0].props.style as object,
      ) as { color: string };
      expect(style.color).toBe(lightColors.accentText);
      expect(
        tree.root.findAllByProps({
          accessibilityLabel: `Recurring ${formatInrCompact(6000)}, Flexible ${formatInrCompact(4000)}, Still to come ${formatInrCompact(2000)}, ${formatInrCompact(0)} left of ${formatInrCompact(10000)}`,
        }).length,
      ).toBeGreaterThan(0);
    });

    it("over budget: the screen-reader summary says how far over", () => {
      const tree = render(3000, 9000, { budget: 10000 });
      const labelled = tree.root.findAllByProps({
        accessibilityLabel: `Recurring ${formatInrCompact(3000)}, Flexible ${formatInrCompact(9000)}, Over budget by ${formatInrCompact(2000)}`,
      });
      expect(labelled.length).toBeGreaterThan(0);
    });

    it("summarises everything for screen readers", () => {
      const tree = render(1500, 500, { budget: 10000, committed: 3000 });
      const labelled = tree.root.findAllByProps({
        accessibilityLabel: `Recurring ${formatInrCompact(1500)}, Flexible ${formatInrCompact(500)}, Still to come ${formatInrCompact(3000)}, ${formatInrCompact(8000)} left of ${formatInrCompact(10000)}`,
      });
      expect(labelled.length).toBeGreaterThan(0);
    });
  });
});
