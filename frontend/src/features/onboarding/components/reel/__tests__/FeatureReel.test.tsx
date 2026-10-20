import { ThemeProvider } from "@/theme/ThemeProvider";

import { FeatureReel } from "../FeatureReel";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerTickHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("@react-navigation/native", () => ({ useIsFocused: () => true }));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("react-native-reanimated/mock"),
  useFrameCallback: () => ({ setActive: () => undefined }),
}));
jest.mock("@shopify/react-native-skia", () => {
  const Empty = () => null;
  const path = { addArc: jest.fn() };
  return {
    Canvas: Empty,
    Circle: Empty,
    Path: Empty,
    Skia: {
      Path: { Make: () => path },
      XYWHRect: () => ({}),
    },
  };
});
jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual("react-native");
  // Every builder method returns the same chainable object; detectors just render children.
  const chain: Record<string, unknown> = new Proxy(
    {},
    { get: () => () => chain },
  );
  return {
    Gesture: { Pan: () => chain, LongPress: () => chain, Simultaneous: () => chain },
    GestureDetector: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
  };
});

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => ReelTree;
};
/* eslint-enable @typescript-eslint/no-require-imports */

type ReelNode = {
  props: Record<string, unknown>;
};
type ReelTree = {
  root: { findAllByProps: (props: object) => ReelNode[] };
  toJSON: () => unknown;
  unmount: () => void;
};

const ROOMY = { availableWidth: 328, availableHeight: 420 };

/** Async so the accessibility-info promises the hooks start settle inside `act`. */
async function renderReel(
  props: Partial<React.ComponentProps<typeof FeatureReel>> = {},
) {
  let tree!: ReelTree;
  await act(async () => {
    tree = create(
      <ThemeProvider>
        <FeatureReel {...ROOMY} {...props} />
      </ThemeProvider>,
    );
  });
  return tree;
}

function unmount(tree: ReelTree) {
  act(() => {
    tree.unmount();
  });
}

function reelNode(tree: ReelTree) {
  const nodes = tree.root.findAllByProps({ accessibilityRole: "adjustable" });
  return nodes.find((node) => typeof node.props.onAccessibilityAction === "function");
}

function fire(tree: ReelTree, actionName: "increment" | "decrement") {
  const node = reelNode(tree);
  act(() => {
    (node?.props.onAccessibilityAction as (event: object) => void)({
      nativeEvent: { actionName },
    });
  });
  // The swap starts with a fade-out; its timer is armed once the state has rendered.
  act(() => {
    jest.advanceTimersByTime(400);
  });
}

describe("FeatureReel", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts on the first scene with an adjustable, labelled container", async () => {
    const tree = await renderReel();
    const node = reelNode(tree);
    expect(node?.props.accessibilityLabel).toBe(
      "Feature preview, Add it in seconds, 1 of 6",
    );
    expect(node?.props.accessibilityActions).toEqual([
      { name: "increment", label: "Next feature" },
      { name: "decrement", label: "Previous feature" },
    ]);
    expect(tree.toJSON()).toBeTruthy();
    unmount(tree);
  });

  it("increment / decrement move between scenes and wrap around", async () => {
    const tree = await renderReel();

    fire(tree, "increment");
    expect(reelNode(tree)?.props.accessibilityLabel).toBe(
      "Feature preview, Just say it, 2 of 6",
    );

    fire(tree, "decrement");
    fire(tree, "decrement");
    expect(reelNode(tree)?.props.accessibilityLabel).toBe(
      "Feature preview, Ask anything, 6 of 6",
    );

    fire(tree, "increment");
    expect(reelNode(tree)?.props.accessibilityLabel).toBe(
      "Feature preview, Add it in seconds, 1 of 6",
    );
    unmount(tree);
  });

  it("renders every scene without throwing", async () => {
    const tree = await renderReel();
    for (let i = 0; i < 6; i += 1) {
      fire(tree, "increment");
    }
    expect(reelNode(tree)?.props.accessibilityLabel).toContain("1 of 6");
    unmount(tree);
  });

  it("renders nothing when there is almost no room", async () => {
    const tree = await renderReel({ availableHeight: 80 });
    expect(tree.toJSON()).toBeNull();
    unmount(tree);
  });
});
