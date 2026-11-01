import { StyleSheet } from "react-native";

import { ThemeProvider } from "@/theme/ThemeProvider";
import { formatInrCompact } from "@/utils/currency";

import { SpendSplitBar } from "../SpendSplitBar";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

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

function render(fixed: number, flexible: number) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <ThemeProvider>
        <SpendSplitBar fixed={fixed} flexible={flexible} />
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
});
