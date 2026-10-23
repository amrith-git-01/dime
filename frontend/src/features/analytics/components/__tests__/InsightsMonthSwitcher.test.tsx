import type { ReactElement } from "react";

import { InsightsMonthSwitcher } from "../InsightsMonthSwitcher";

jest.mock("@/theme", () => {
  const colors = new Proxy({}, { get: () => "#000" });
  const shadows = new Proxy({}, { get: () => ({}) });
  return {
    useTheme: () => ({ colors, shadows, scheme: "light" }),
    createThemedStyles: (build: (theme: unknown) => object) => {
      const styles = build({ colors, shadows });
      const hook = () => styles;
      hook.forTheme = () => styles;
      return hook;
    },
  };
});

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => {
    root: {
      findAll: (predicate: (node: { props: Record<string, unknown> }) => boolean) => {
        props: Record<string, unknown>;
      }[];
    };
    unmount: () => void;
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const render = async (overrides: Partial<Parameters<typeof InsightsMonthSwitcher>[0]> = {}) => {
  const onPrevMonth = jest.fn();
  const onNextMonth = jest.fn();
  let rendered!: ReturnType<typeof create>;
  await act(async () => {
    rendered = create(
      <InsightsMonthSwitcher
        selectedMonth="Oct 2026"
        prevMonthLabel="Sep 2026"
        nextMonthLabel="Nov 2026"
        canGoPrevMonth
        canGoNextMonth
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        {...overrides}
      />,
    );
  });
  const byLabel = (label: string) =>
    rendered.root.findAll(
      (node) =>
        node.props.accessibilityLabel === label &&
        typeof node.props.onPress === "function",
    )[0];
  return { rendered, byLabel, onPrevMonth, onNextMonth };
};

describe("InsightsMonthSwitcher", () => {
  it("fires the previous and next handlers from the labelled arrows", async () => {
    const { rendered, byLabel, onPrevMonth, onNextMonth } = await render();
    (byLabel("Previous month, Sep 2026")?.props.onPress as () => void)();
    (byLabel("Next month, Nov 2026")?.props.onPress as () => void)();
    expect(onPrevMonth).toHaveBeenCalledTimes(1);
    expect(onNextMonth).toHaveBeenCalledTimes(1);
    await act(async () => {
      rendered.unmount();
    });
  });

  it("disables an arrow when that direction is unavailable", async () => {
    const { rendered, byLabel } = await render({ canGoNextMonth: false });
    expect(byLabel("Next month, Nov 2026")?.props.disabled).toBe(true);
    expect(byLabel("Previous month, Sep 2026")?.props.disabled).toBe(false);
    await act(async () => {
      rendered.unmount();
    });
  });

  it("gives the arrows a 48dp target and announces month changes", async () => {
    const { rendered, byLabel } = await render();
    expect(byLabel("Previous month, Sep 2026")?.props.hitSlop).toBeGreaterThanOrEqual(12);
    expect(byLabel("Next month, Nov 2026")?.props.hitSlop).toBeGreaterThanOrEqual(12);
    const live = rendered.root.findAll(
      (node) => node.props.accessibilityLiveRegion === "polite",
    );
    expect(live.length).toBeGreaterThan(0);
    await act(async () => {
      rendered.unmount();
    });
  });
});
