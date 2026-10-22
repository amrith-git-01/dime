import type { ReactElement } from "react";

import { ThemeProvider } from "@/theme/ThemeProvider";

import { InsightsMonthSwitcher } from "../InsightsMonthSwitcher";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-navigation-bar", () => ({ setStyle: jest.fn() }));
jest.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: ReactElement) => {
    root: {
      findAll: (predicate: (node: { props: Record<string, unknown> }) => boolean) => {
        props: Record<string, unknown>;
      }[];
    };
    toJSON: () => unknown;
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

function setup(over: Partial<{ canGoPrevMonth: boolean; canGoNextMonth: boolean }> = {}) {
  const onPrevMonth = jest.fn();
  const onNextMonth = jest.fn();
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(
      <ThemeProvider>
        <InsightsMonthSwitcher
          selectedMonth="October 2026"
          canGoPrevMonth={over.canGoPrevMonth ?? true}
          canGoNextMonth={over.canGoNextMonth ?? true}
          onPrevMonth={onPrevMonth}
          onNextMonth={onNextMonth}
        />
      </ThemeProvider>,
    );
  });
  const button = (label: string) =>
    tree.root.findAll(
      (node) => node.props.accessibilityLabel === label && typeof node.props.onPress === "function",
    )[0]!;
  return { tree, button, onPrevMonth, onNextMonth };
}

describe("InsightsMonthSwitcher", () => {
  it("shows the month and moves between months with the labelled arrows", () => {
    const { tree, button, onPrevMonth, onNextMonth } = setup();
    expect(JSON.stringify(tree.toJSON())).toContain("October 2026");
    act(() => (button("Previous month").props.onPress as () => void)());
    act(() => (button("Next month").props.onPress as () => void)());
    expect(onPrevMonth).toHaveBeenCalledTimes(1);
    expect(onNextMonth).toHaveBeenCalledTimes(1);
  });

  it("disables an arrow that has nowhere to go", () => {
    const { button } = setup({ canGoNextMonth: false });
    expect(button("Next month").props.disabled).toBe(true);
    expect(button("Previous month").props.disabled).toBe(false);
  });
});
