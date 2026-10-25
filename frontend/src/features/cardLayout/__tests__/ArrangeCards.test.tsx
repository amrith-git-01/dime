import { ThemeProvider } from "@/theme/ThemeProvider";
import { useAppTourStore } from "@/features/appTour/store/appTourStore";

import { DEFAULT_CARD_ORDER } from "../cardIds";
import { ArrangeCards } from "../components/ArrangeCards";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerConfirmHaptic: jest.fn(() => Promise.resolve()),
  triggerTickHaptic: jest.fn(() => Promise.resolve()),
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));

type SheetProps = {
  visible: boolean;
  screen: string;
  order: readonly string[];
  onCancel: () => void;
  onDone: (order: string[]) => void;
};
const mockSheet: { props: SheetProps | null; mounts: number } = { props: null, mounts: 0 };
jest.mock("../components/ArrangeSheet", () => {
  const React = jest.requireActual("react");
  return {
    ArrangeSheet: (props: SheetProps) => {
      React.useEffect(() => {
        mockSheet.mounts += 1;
      }, []);
      mockSheet.props = props;
      return null;
    },
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
  root: { findAll: (predicate: (node: Node) => boolean) => Node[] };
  unmount: () => void;
};

const HOME = DEFAULT_CARD_ORDER.home;
const SWAPPED = ["home.getStarted", "home.month", ...HOME.slice(2)] as typeof HOME[number][];

function render(commit = jest.fn()) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let tree!: Tree;
  act(() => {
    tree = create(
      <ThemeProvider>
        <ArrangeCards screen="home" cardOrder={{ order: HOME, ready: true, commit }} />
      </ThemeProvider>,
    );
  });
  return { tree, commit };
}

const openSheet = (tree: Tree) => {
  const button = tree.root.findAll(
    (n) => n.props.accessibilityLabel === "Arrange Home" && typeof n.props.onPress === "function",
  )[0];
  act(() => void (button.props.onPress as () => void)());
};

beforeEach(() => {
  mockSheet.props = null;
  mockSheet.mounts = 0;
  useAppTourStore.setState({ active: false });
});

describe("ArrangeCards", () => {
  it("has the Arrange button and mounts no sheet until it is pressed", () => {
    const { tree } = render();
    expect(mockSheet.props).toBeNull();
    openSheet(tree);
    expect(mockSheet.props?.visible).toBe(true);
    expect(mockSheet.props?.screen).toBe("home");
    expect(mockSheet.props?.order).toEqual(HOME);
    act(() => tree.unmount());
  });

  it("Done closes the sheet and commits a changed order", () => {
    const { tree, commit } = render();
    openSheet(tree);
    act(() => mockSheet.props?.onDone(SWAPPED));
    expect(mockSheet.props?.visible).toBe(false);
    expect(commit).toHaveBeenCalledWith(SWAPPED);
    act(() => tree.unmount());
  });

  it("Done with nothing changed saves nothing", () => {
    const { tree, commit } = render();
    openSheet(tree);
    act(() => mockSheet.props?.onDone([...HOME]));
    expect(mockSheet.props?.visible).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("Cancel closes the sheet and saves nothing", () => {
    const { tree, commit } = render();
    openSheet(tree);
    act(() => mockSheet.props?.onCancel());
    expect(mockSheet.props?.visible).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("opens a fresh sheet each time", () => {
    const { tree } = render();
    openSheet(tree);
    act(() => mockSheet.props?.onCancel());
    openSheet(tree);
    expect(mockSheet.mounts).toBe(2);
    expect(mockSheet.props?.visible).toBe(true);
    act(() => tree.unmount());
  });

  it("starting a tour closes the sheet", () => {
    const { tree } = render();
    openSheet(tree);
    expect(mockSheet.props?.visible).toBe(true);
    act(() => useAppTourStore.setState({ active: true }));
    expect(mockSheet.props?.visible).toBe(false);
    act(() => tree.unmount());
  });
});
