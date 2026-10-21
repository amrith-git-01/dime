import { createElement, type ReactElement } from "react";

import { notifyTourTabFocused, useCurrentRouteName } from "../useTourPaused";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

let mockReady = false;
let mockRoute: string | undefined;
const mockStateListeners = new Set<() => void>();
jest.mock("@/navigation/navigationRef", () => ({
  navigationRef: {
    isReady: () => mockReady,
    getCurrentRoute: () => (mockReady && mockRoute ? { name: mockRoute } : undefined),
    addListener: (_type: string, listener: () => void) => {
      mockStateListeners.add(listener);
      return () => mockStateListeners.delete(listener);
    },
  },
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

let latest: string | undefined | "unset" = "unset";
function Probe() {
  latest = useCurrentRouteName();
  return null;
}

describe("useCurrentRouteName", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReady = false;
    mockRoute = undefined;
    mockStateListeners.clear();
    latest = "unset";
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("follows the navigation state", async () => {
    mockReady = true;
    mockRoute = "Budgets";
    let renderer: { unmount: () => void } | undefined;
    await act(async () => {
      renderer = create(createElement(Probe));
    });
    expect(latest).toBe("Budgets");
    mockRoute = "Settings";
    await act(async () => {
      mockStateListeners.forEach((listener) => listener());
    });
    expect(latest).toBe("Settings");
    await act(async () => {
      renderer?.unmount();
    });
    expect(mockStateListeners.size).toBe(0);
  });

  it("hears about the first route when it subscribed before the navigator was ready (cold start)", async () => {
    let renderer: { unmount: () => void } | undefined;
    await act(async () => {
      renderer = create(createElement(Probe));
    });
    expect(latest).toBeUndefined();
    mockReady = true;
    mockRoute = "Home";
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
    expect(latest).toBe("Home");
    await act(async () => {
      renderer?.unmount();
    });
  });

  it("hears about a tab gaining focus even when no state event fires (the first tab mounting)", async () => {
    mockReady = true;
    mockRoute = undefined;
    let renderer: { unmount: () => void } | undefined;
    await act(async () => {
      renderer = create(createElement(Probe));
    });
    expect(latest).toBeUndefined();
    mockRoute = "Home";
    await act(async () => {
      notifyTourTabFocused();
    });
    expect(latest).toBe("Home");
    await act(async () => {
      renderer?.unmount();
    });
  });

  it("stops listening when unmounted, and stops polling for readiness", async () => {
    let renderer: { unmount: () => void } | undefined;
    await act(async () => {
      renderer = create(createElement(Probe));
    });
    await act(async () => {
      renderer?.unmount();
    });
    mockReady = true;
    mockRoute = "Home";
    const before = latest;
    await act(async () => {
      jest.advanceTimersByTime(500);
      notifyTourTabFocused();
    });
    expect(latest).toBe(before);
  });
});
