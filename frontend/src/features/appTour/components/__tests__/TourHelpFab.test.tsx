import { createElement, type ReactElement } from "react";

import { useAppTourStore } from "../../store/appTourStore";
import { TourHelpFab } from "../TourHelpFab";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
  triggerConfirmHaptic: jest.fn(() => Promise.resolve()),
  triggerTickHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/stores/authSessionStore", () => ({
  useAuthSessionStore: {
    getState: () => ({ userId: "user-a" }),
    subscribe: () => () => undefined,
  },
}));
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

const mockLaunch = jest.fn();
jest.mock("../../utils/launchTour", () => ({
  launchTour: (...args: unknown[]) => mockLaunch(...args),
}));
let mockTab: string | null = "Home";
let mockSeen = new Set<string>(["firstExpense"]);
jest.mock("../../hooks/useTourProgress", () => ({
  useFocusedTourTab: () => mockTab,
  useTourProgress: () => ({ seen: mockSeen, seenCount: mockSeen.size, total: 7, allDone: false }),
}));

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

type Rendered = ReturnType<typeof create>;

const button = (rendered: Rendered) =>
  rendered.root.findAll(
    (node) => node.props.accessibilityLabel === "Take a tour of this screen" && "onPress" in node.props,
  );

async function render(visible = true): Promise<Rendered> {
  let rendered: Rendered | undefined;
  await act(async () => {
    rendered = create(createElement(TourHelpFab, { visible, right: 16, bottom: 160 }));
  });
  return rendered!;
}

describe("the floating ? button", () => {
  beforeEach(() => {
    mockLaunch.mockClear();
    mockTab = "Home";
    mockSeen = new Set(["firstExpense"]);
    useAppTourStore.setState({ active: false });
  });

  it("is there, and tappable, as soon as it is shown: it starts the focused tab's tour", async () => {
    const rendered = await render();
    const [pressable] = button(rendered);
    expect(pressable).toBeDefined();
    (pressable.props.onPress as () => void)();
    expect(mockLaunch).toHaveBeenCalledWith("home");
    await act(async () => rendered.unmount());
  });

  it("is not there when the tab's tour was seen, or the host hides it, or no tab is focused", async () => {
    mockSeen = new Set(["firstExpense", "home"]);
    let rendered = await render();
    expect(button(rendered)).toHaveLength(0);
    await act(async () => rendered.unmount());

    mockSeen = new Set(["firstExpense"]);
    rendered = await render(false);
    expect(button(rendered)).toHaveLength(0);
    await act(async () => rendered.unmount());

    mockTab = null;
    rendered = await render();
    expect(button(rendered)).toHaveLength(0);
    await act(async () => rendered.unmount());
  });

  it("is out of sight and out of reach while a tour runs", async () => {
    const rendered = await render();
    await act(async () => {
      useAppTourStore.setState({ active: true });
    });
    const hiding = rendered.root.findAll(
      (node) => node.props.pointerEvents === "none" && Array.isArray(node.props.style),
    );
    const flat = hiding.flatMap((node) => (node.props.style as object[]).flat(Infinity));
    expect(flat.some((style) => (style as { opacity?: number })?.opacity === 0)).toBe(true);
    await act(async () => rendered.unmount());
  });
});
