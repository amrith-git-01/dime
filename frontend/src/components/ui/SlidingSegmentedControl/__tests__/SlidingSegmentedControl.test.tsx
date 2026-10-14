import { ThemeProvider } from "@/theme/ThemeProvider";

import { SlidingSegmentedControl } from "../SlidingSegmentedControl";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("react-native-reanimated", () => {
  const { Easing, View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: { View },
    Easing,
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: (factory: () => object) => factory(),
    withSpring: (value: number) => value,
  };
});

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => {
    root: {
      findAllByProps: (props: object) => {
        props: Record<string, unknown>;
      }[];
    };
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly", tone: "success" as const },
];

function renderControl(value: string, onChange: (next: string) => void) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <ThemeProvider>
        <SlidingSegmentedControl
          options={OPTIONS}
          value={value}
          onChange={onChange}
        />
      </ThemeProvider>,
    );
  });
  return tree;
}

function tabs(tree: ReturnType<typeof create>) {
  return tree.root
    .findAllByProps({ accessibilityRole: "tab" })
    .filter((node) => typeof node.props.onPress === "function");
}

describe("SlidingSegmentedControl", () => {
  it("marks only the current option as selected", () => {
    const tree = renderControl("yearly", jest.fn());
    const states = tabs(tree).map(
      (node) => (node.props.accessibilityState as { selected: boolean }).selected,
    );
    expect(states).toEqual([false, true]);
  });

  it("calls onChange with the pressed option's value", () => {
    const onChange = jest.fn();
    const tree = renderControl("monthly", onChange);
    act(() => {
      (tabs(tree)[1].props.onPress as () => void)();
    });
    expect(onChange).toHaveBeenCalledWith("yearly");
  });

  it("ignores a press on the already selected option", () => {
    const onChange = jest.fn();
    const tree = renderControl("monthly", onChange);
    act(() => {
      (tabs(tree)[0].props.onPress as () => void)();
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
