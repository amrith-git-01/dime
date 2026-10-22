import { AheadSection } from "../AheadSection";
import { act, joinedText, makeActions, makeForecast, render } from "./forecastTestKit";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/hooks/useTourTarget", () => ({ useTourTarget: () => ({}) }));
jest.mock("react-native-reanimated", () => {
  const { Easing, View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component: unknown) => component },
    Easing,
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: (factory: () => object) => factory(),
    withRepeat: (value: number) => value,
    withSequence: (value: number) => value,
    withTiming: (value: number) => value,
  };
});

const baseProps = {
  loading: false,
  failed: false,
  onRetry: jest.fn(),
  actions: makeActions(),
};

describe("AheadSection", () => {
  it("lays the cards out in order under an Ahead header", () => {
    const text = joinedText(render(<AheadSection {...baseProps} forecast={makeForecast()} />));
    const order = [
      "Ahead",
      "MONTH FORECAST",
      "SAFE TO SPEND TODAY",
      "COMING UP",
      "WATCH",
      "CATEGORIES AHEAD",
    ].map((heading) => text.indexOf(heading));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("leaves out the cards that have nothing to say", () => {
    const text = joinedText(
      render(
        <AheadSection
          {...baseProps}
          forecast={makeForecast({ safeToday: null, watch: [], categories: [] })}
        />,
      ),
    );
    expect(text).toContain("MONTH FORECAST");
    expect(text).toContain("COMING UP");
    expect(text).not.toContain("SAFE TO SPEND");
    expect(text).not.toContain("WATCH");
    expect(text).not.toContain("CATEGORIES AHEAD");
  });

  it("shows placeholders while the forecast loads", () => {
    const text = joinedText(render(<AheadSection {...baseProps} forecast={undefined} loading />));
    expect(text).toContain("Ahead");
    expect(text).toContain("MONTH FORECAST");
    expect(text).toContain("COMING UP");
    expect(text).not.toContain("This month will likely");
  });

  it("offers a retry when the forecast failed", () => {
    const onRetry = jest.fn();
    const tree = render(
      <AheadSection {...baseProps} forecast={undefined} failed onRetry={onRetry} />,
    );
    expect(joinedText(tree)).toContain("Couldn't load your forecast");
    expect(joinedText(tree)).toContain("Retry");
    const retry = tree.root.findAll(
      (node) => node.props.accessibilityRole === "button" && typeof node.props.onPress === "function",
    )[0];
    act(() => (retry!.props.onPress as () => void)());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when there is nothing to show or wait for", () => {
    const tree = render(<AheadSection {...baseProps} forecast={undefined} />);
    expect(joinedText(tree)).toBe("");
  });
});
