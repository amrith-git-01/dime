import { Image, StyleSheet } from "react-native";

import { SPLASH_WORDMARK_ASPECT } from "@/constants/splash";
import { ThemeProvider } from "@/theme/ThemeProvider";

import AuthScreen from "../AuthScreen";

const mockReel = jest.fn();
let mockModel = {
  busy: false,
  googleLoading: false,
  googleError: null as string | null,
  submitGoogle: jest.fn(),
};

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));
jest.mock("@/components/layout/StackScreenShell", () => ({
  StackScreenShell: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/components/ui", () => {
  const { Text } = jest.requireActual("react-native");
  return { Button: ({ title }: { title: string }) => <Text>{title}</Text> };
});
jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => () => null);
jest.mock("../useAuthScreenModel", () => ({
  useAuthScreenModel: () => mockModel,
}));
// The barrel also pulls in Skia-based checklist parts, so it is replaced rather than partly mocked.
jest.mock("@/features/onboarding/components", () => ({
  FeatureReel: (props: object) => {
    mockReel(props);
    return null;
  },
  WelcomeTrustLines: jest.requireActual(
    "@/features/onboarding/components/WelcomeTrustLines",
  ).WelcomeTrustLines,
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => Tree;
};
/* eslint-enable @typescript-eslint/no-require-imports */

type Node = { props: Record<string, unknown>; type: unknown };
type Tree = {
  root: {
    findAll: (predicate: (node: Node) => boolean) => Node[];
    findAllByType: (type: unknown) => Node[];
  };
  unmount: () => void;
};

function render() {
  let tree!: Tree;
  act(() => {
    tree = create(
      <ThemeProvider>
        <AuthScreen />
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

function texts(tree: Tree): string[] {
  return tree.root
    .findAll(() => true)
    .filter((node) => node.type === "Text" && typeof node.props.children === "string")
    .map((node) => node.props.children as string);
}

describe("AuthScreen", () => {
  beforeEach(() => {
    mockReel.mockClear();
    mockModel = { ...mockModel, busy: false, googleError: null };
  });

  it("sizes the wordmark from the image aspect so it sits flush left", () => {
    const tree = render();
    const [image] = tree.root.findAllByType(Image);
    const style = StyleSheet.flatten(image.props.style as never) as {
      width: number;
      height: number;
    };
    expect(style.width).toBe(84);
    expect(style.height).toBeCloseTo(84 / SPLASH_WORDMARK_ASPECT, 5);
    expect(image.props.accessibilityLabel).toBe("Dime");
    unmount(tree);
  });

  it("shows the headline, subhead, button and trust row", () => {
    const tree = render();
    const all = texts(tree);
    expect(all).toContain("Know where every rupee goes");
    expect(all).toContain("Log it in seconds. Watch your month take shape.");
    expect(all).toContain("Continue with Google");
    expect(all).toContain("No bank login · Your data is never sold");
    unmount(tree);
  });

  it("shows a sign-in error above the button", () => {
    mockModel = { ...mockModel, googleError: "Sign-in failed" };
    const tree = render();
    expect(texts(tree)).toContain("Sign-in failed");
    unmount(tree);
  });

  it("gives the frameless reel the measured region, minus its top gap, and pauses it while busy", () => {
    mockModel = { ...mockModel, busy: true };
    const tree = render();
    const region = tree.root.findAll(
      (node) => typeof node.props.onLayout === "function",
    )[0];
    act(() => {
      (region.props.onLayout as (event: object) => void)({
        nativeEvent: { layout: { width: 327, height: 400 } },
      });
    });
    const last = mockReel.mock.calls[mockReel.mock.calls.length - 1][0];
    expect(last).toMatchObject({
      frameless: true,
      availableWidth: 327,
      availableHeight: 384,
      paused: true,
    });
    unmount(tree);
  });
});
