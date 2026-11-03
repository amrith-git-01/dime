import { useRef } from "react";

import { useBudgetSectionScroll } from "../useBudgetSectionScroll";

const mockRoute: { params?: { scrollTo?: string; recurringKind?: string } } = {};
const mockSetParams = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useRoute: () => mockRoute,
  useNavigation: () => ({ setParams: mockSetParams }),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const scrollTo = jest.fn();
const showCurrentMonth = jest.fn();
let onCardLayout: (id: string, event: never) => void = () => undefined;

function Probe() {
  const ref = useRef({ scrollTo });
  onCardLayout = useBudgetSectionScroll(ref, showCurrentMonth).onCardLayout as never;
  return null;
}

const layout = (y: number) => ({ nativeEvent: { layout: { x: 0, y, width: 360, height: 100 } } }) as never;

function mount() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<Probe />);
  });
  return tree;
}

beforeEach(() => {
  scrollTo.mockReset();
  showCurrentMonth.mockReset();
  mockSetParams.mockReset();
  delete mockRoute.params;
});

describe("useBudgetSectionScroll", () => {
  it("does nothing without a request", () => {
    const tree = mount();
    act(() => onCardLayout("budgets.recurring", layout(300)));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(showCurrentMonth).not.toHaveBeenCalled();
    expect(mockSetParams).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it("waits for the requested section to be measured, scrolls once, then clears the params", () => {
    mockRoute.params = { scrollTo: "categories" };
    const tree = mount();
    expect(showCurrentMonth).toHaveBeenCalled();
    // Another section's layout is not the one asked for.
    act(() => onCardLayout("budgets.recurring", layout(300)));
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => onCardLayout("budgets.categories", layout(900)));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 900, animated: true });
    expect(mockSetParams).toHaveBeenCalledWith({ recurringKind: undefined, scrollTo: undefined });
    act(() => tree.unmount());
  });

  it("scrolls at once when the section is already measured", () => {
    const tree = mount();
    act(() => onCardLayout("budgets.recurring", layout(300)));
    mockRoute.params = { scrollTo: "recurring" };
    act(() => tree.unmount());
    const again = mount();
    act(() => onCardLayout("budgets.recurring", layout(300)));
    expect(scrollTo).toHaveBeenCalledWith({ y: 300, animated: true });
    act(() => again.unmount());
  });

  it("treats the older recurringKind param as a request for the Recurring section", () => {
    mockRoute.params = { recurringKind: "subscription" };
    const tree = mount();
    act(() => onCardLayout("budgets.recurring", layout(420)));
    expect(scrollTo).toHaveBeenCalledWith({ y: 420, animated: true });
    act(() => tree.unmount());
  });

  it("ignores cards that are not sections", () => {
    mockRoute.params = { scrollTo: "recurring" };
    const tree = mount();
    act(() => onCardLayout("budgets.summary", layout(10)));
    expect(scrollTo).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
