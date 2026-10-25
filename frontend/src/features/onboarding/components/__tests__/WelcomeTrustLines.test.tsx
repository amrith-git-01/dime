import { StyleSheet } from "react-native";

import { ThemeProvider } from "@/theme/ThemeProvider";

import { WelcomeTrustLines } from "../WelcomeTrustLines";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

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

function render() {
  let tree!: Tree;
  act(() => {
    tree = create(
      <ThemeProvider>
        <WelcomeTrustLines />
      </ThemeProvider>,
    );
  });
  return tree;
}

function unmount(tree: Tree) {
  act(() => {
    tree.unmount();
  });
}

describe("WelcomeTrustLines", () => {
  it("is one left-aligned line with both promises", () => {
    const tree = render();
    const label = tree.root.findAll(
      (node) =>
        node.type === "Text" &&
        node.props.children === "No bank login · Your data is never sold",
    )[0];
    expect(label).toBeDefined();
    expect(StyleSheet.flatten(label.props.style as never)).toMatchObject({
      textAlign: "left",
      fontSize: 13,
      lineHeight: 18,
    });
    unmount(tree);
  });

  it("reads as a single accessibility element", () => {
    const tree = render();
    const group = tree.root.findAll(
      (node) =>
        node.type === "View" && node.props.accessible === true,
    )[0];
    expect(group.props.accessibilityLabel).toBe(
      "No bank login. Your data is never sold.",
    );
    unmount(tree);
  });
});
