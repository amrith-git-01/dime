import { StyleSheet } from "react-native";

import { ThemeProvider } from "@/theme/ThemeProvider";

import { REEL_SCENE_MS } from "../reelLogic";
import { ReelProgress, type ReelProgressProps } from "../ReelProgress";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
// The official mock runs `useAnimatedStyle` worklets during render, so the first commit's styles
// are exactly what the screen would paint before any effect runs.
jest.mock("react-native-reanimated", () =>
  jest.requireActual("react-native-reanimated/mock"),
);

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => ProgressTree;
};
/* eslint-enable @typescript-eslint/no-require-imports */

type ProgressNode = { props: Record<string, unknown> };
type ProgressTree = {
  root: { findAll: (predicate: (node: ProgressNode) => boolean) => ProgressNode[] };
  update: (element: React.ReactElement) => void;
  unmount: () => void;
};

function unmount(tree: ProgressTree) {
  act(() => {
    tree.unmount();
  });
}

const noop = () => undefined;

function baseProps(overrides: Partial<ReelProgressProps>): ReelProgressProps {
  return {
    count: 6,
    activeIndex: 0,
    reduceMotion: false,
    phase: "playing",
    clock: { value: 0 } as ReelProgressProps["clock"],
    sceneGen: { value: 0 } as ReelProgressProps["sceneGen"],
    activeGen: 0,
    onSelect: noop,
    ...overrides,
  };
}

function element(props: ReelProgressProps) {
  return (
    <ThemeProvider>
      <ReelProgress {...props} />
    </ThemeProvider>
  );
}

/** Distinct scaleX values of the live fill (full and empty segments have none). */
function liveScales(tree: ProgressTree): number[] {
  const scales = tree.root
    .findAll((node) => {
      const style = StyleSheet.flatten(node.props.style as never) as
        | { transform?: { scaleX?: number }[] }
        | undefined;
      return style?.transform?.[0]?.scaleX !== undefined;
    })
    .map(
      (node) =>
        (
          StyleSheet.flatten(node.props.style as never) as {
            transform: { scaleX: number }[];
          }
        ).transform[0].scaleX,
    );
  // The animated component and the host view under it both carry the style.
  return Array.from(new Set(scales));
}

describe("ReelProgress live fill", () => {
  it("is empty on the first commit after the scene changes, while the clock is still stale", async () => {
    const clock = { value: REEL_SCENE_MS } as ReelProgressProps["clock"];
    const sceneGen = { value: 0 } as ReelProgressProps["sceneGen"];
    let tree!: ProgressTree;
    await act(async () => {
      tree = create(element(baseProps({ activeIndex: 0, activeGen: 0, clock, sceneGen })));
    });
    expect(liveScales(tree)).toEqual([1]);

    // The new scene landed (index 1, generation 2), but the effect that resets the clock and
    // writes `sceneGen` has not run yet: the clock still holds the previous scene's end.
    await act(async () => {
      tree.update(element(baseProps({ activeIndex: 1, activeGen: 2, clock, sceneGen })));
    });
    expect(liveScales(tree)).toEqual([0]);
    unmount(tree);
  });

  it("follows the clock once the scene's generation has been announced", async () => {
    const clock = { value: 0 } as ReelProgressProps["clock"];
    const sceneGen = { value: 2 } as ReelProgressProps["sceneGen"];
    let tree!: ProgressTree;
    await act(async () => {
      tree = create(element(baseProps({ activeIndex: 1, activeGen: 2, clock, sceneGen })));
    });
    expect(liveScales(tree)).toEqual([0]);

    // (A new object: the mock re-runs worklets on render, and the memo would skip equal props.)
    const halfway = { value: REEL_SCENE_MS / 2 } as ReelProgressProps["clock"];
    await act(async () => {
      tree.update(
        element(baseProps({ activeIndex: 1, activeGen: 2, clock: halfway, sceneGen })),
      );
    });
    expect(liveScales(tree)).toEqual([0.5]);
    unmount(tree);
  });

  it("draws the active segment complete while the scene is leaving", async () => {
    const clock = { value: 1200 } as ReelProgressProps["clock"];
    const sceneGen = { value: 2 } as ReelProgressProps["sceneGen"];
    let tree!: ProgressTree;
    await act(async () => {
      tree = create(
        element(baseProps({ activeIndex: 1, activeGen: 2, phase: "exiting", clock, sceneGen })),
      );
    });
    // No live fill at all: the segment is a plain full bar, not frozen part-way.
    expect(liveScales(tree)).toEqual([]);
    unmount(tree);
  });
});

describe("ReelProgress frameless", () => {
  function trackHeights(tree: ProgressTree) {
    return tree.root
      .findAll((node) => {
        const style = StyleSheet.flatten(node.props.style as never) as
          | { overflow?: string; height?: number }
          | undefined;
        return style?.overflow === "hidden";
      })
      .map(
        (node) =>
          (StyleSheet.flatten(node.props.style as never) as { height: number }).height,
      );
  }

  it("draws 4 dp tracks by default and 3 dp tracks when frameless", async () => {
    let tree!: ProgressTree;
    await act(async () => {
      tree = create(element(baseProps({})));
    });
    expect(new Set(trackHeights(tree))).toEqual(new Set([4]));
    await act(async () => {
      tree.update(element(baseProps({ frameless: true })));
    });
    expect(new Set(trackHeights(tree))).toEqual(new Set([3]));
    unmount(tree);
  });
});
