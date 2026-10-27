import { Text } from "react-native";

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => TestTree;
};
/* eslint-enable @typescript-eslint/no-require-imports */

export type TestNode = {
  type: unknown;
  props: Record<string, unknown>;
  parent: TestNode | null;
};

export type TestTree = {
  root: { findAll: (predicate: (node: TestNode) => boolean) => TestNode[] };
  toJSON: () => unknown;
  unmount: () => void;
  update: (element: React.ReactElement) => void;
};

/** Renders inside `act`, async so the accessibility-info promises the hooks start can settle. */
export async function renderTree(element: React.ReactElement): Promise<TestTree> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let tree!: TestTree;
  await act(async () => {
    tree = create(element);
  });
  return tree;
}

/** Renders new props into a mounted tree (the same component, as when a screen is reused). */
export function updateTree(tree: TestTree, element: React.ReactElement) {
  act(() => {
    tree.update(element);
  });
}

export function runAct(callback: () => void | Promise<void>) {
  return act(callback);
}

export function unmountTree(tree: TestTree) {
  act(() => {
    tree.unmount();
  });
}

/** The text of every `Text` in the tree. */
export function textsOf(tree: TestTree): string[] {
  return tree.root
    .findAll((node) => node.type === Text)
    .map((node) => {
      const children = node.props.children;
      return Array.isArray(children) ? children.join("") : String(children);
    });
}

/** Pressable-like nodes with a label and a handler (the composite and host both match; the first is enough). */
export function pressables(tree: TestTree, label: string): TestNode[] {
  return tree.root.findAll(
    (node) =>
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === "function",
  );
}

export function press(tree: TestTree, label: string) {
  const node = pressables(tree, label)[0];
  if (!node) {
    throw new Error(`No pressable labelled "${label}"`);
  }
  act(() => {
    (node.props.onPress as () => void)();
  });
}

/** Presses the nearest pressable around the text (a button or row that has no accessibility label). */
export function pressText(tree: TestTree, text: string) {
  const label = tree.root.findAll(
    (node) =>
      node.type === Text &&
      (Array.isArray(node.props.children)
        ? node.props.children.join("")
        : String(node.props.children)) === text,
  )[0];
  let node: TestNode | null = label ?? null;
  while (node && typeof node.props.onPress !== "function") {
    node = node.parent;
  }
  if (!node) {
    throw new Error(`No pressable around "${text}"`);
  }
  const target = node;
  act(() => {
    (target.props.onPress as () => void)();
  });
}

/** Like `press`, for a handler that awaits something (the promises settle inside `act`). */
export async function pressAsync(tree: TestTree, label: string) {
  const node = pressables(tree, label)[0];
  if (!node) {
    throw new Error(`No pressable labelled "${label}"`);
  }
  await act(async () => {
    (node.props.onPress as () => void)();
  });
}

export function summaryLabel(tree: TestTree): string {
  const node = tree.root.findAll(
    (candidate) => candidate.props.accessibilityRole === "summary",
  )[0];
  return String(node?.props.accessibilityLabel ?? "");
}
