import { QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { settingsQueryKeys } from "@/features/settings/queryKeys";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/features/settings/types";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { clearAppliedCardOrders, getAppliedCardOrder } from "../appliedOrder";
import { DEFAULT_CARD_ORDER } from "../cardIds";
import { CARD_ORDER_WAIT_MS, useCardOrder } from "../hooks/useCardOrder";

const mockFocused = { value: true };
const mockSettings: {
  data: UserSettings | undefined;
  isError: boolean;
  fetchStatus: "idle" | "fetching" | "paused";
} = { data: undefined, isError: false, fetchStatus: "fetching" };
const mockMutate = jest.fn();

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@react-navigation/native", () => ({
  useIsFocused: () => mockFocused.value,
}));
jest.mock("@/hooks/useSessionUserId", () => ({
  useSessionUserId: () => ({ userId: "user-1" }),
}));
jest.mock("@/features/settings/hooks/useUserSettingsQuery", () => ({
  useUserSettingsQuery: () => ({
    data: mockSettings.data,
    isError: mockSettings.isError,
    fetchStatus: mockSettings.fetchStatus,
  }),
}));
jest.mock("@/features/settings/hooks/useUpdateUserSettingsMutation", () => ({
  useUpdateUserSettingsMutation: () => ({ mutate: mockMutate }),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => void | Promise<void>) => void | Promise<void>;
  create: (element: React.ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const HOME = DEFAULT_CARD_ORDER.home;
const REVERSED = [...HOME].reverse();

const withLayout = (home?: string[]): UserSettings => ({
  ...DEFAULT_USER_SETTINGS,
  cardLayouts: home ? { home } : {},
});

type Result = ReturnType<typeof useCardOrder<"home">>;

function mount({ saving = false }: { saving?: boolean } = {}) {
  const queryClient = createTestQueryClient();
  if (saving) {
    jest.spyOn(queryClient, "isMutating").mockReturnValue(1);
  }
  const refetch = jest.spyOn(queryClient, "refetchQueries");
  const result: { current: Result | undefined } = { current: undefined };
  function Probe() {
    result.current = useCardOrder("home");
    return null;
  }
  const element = () => (
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>
  );
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(element());
  });
  return {
    queryClient,
    get current() {
      return result.current as Result;
    },
    rerender: () => act(() => void (renderer as unknown as { update: (e: React.ReactElement) => void }).update(element())),
    unmount: () => act(() => renderer.unmount()),
    refetch,
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  mockFocused.value = true;
  mockSettings.data = undefined;
  mockSettings.isError = false;
  mockSettings.fetchStatus = "fetching";
  mockMutate.mockReset();
  clearAppliedCardOrders();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useCardOrder", () => {
  it("shows the saved order on the very first render when settings are cached", () => {
    mockSettings.data = withLayout(REVERSED);
    const hook = mount();
    expect(hook.current.ready).toBe(true);
    expect(hook.current.order).toEqual(REVERSED);
    hook.unmount();
  });

  it("is the default order when nothing is saved", () => {
    mockSettings.data = withLayout();
    const hook = mount();
    expect(hook.current.order).toEqual([...HOME]);
    hook.unmount();
  });

  it("normalises a saved order that is missing a card", () => {
    mockSettings.data = withLayout(["home.recent", "home.month", "home.stats"]);
    const hook = mount();
    expect(hook.current.order).toEqual([
      "home.recent",
      "home.month",
      "home.getStarted",
      "home.stats",
      "home.upcoming",
      "home.categories",
    ]);
    hook.unmount();
  });

  it("does not re-arrange the screen when another device's order arrives while it is focused", () => {
    mockSettings.data = withLayout();
    const hook = mount();
    mockSettings.data = withLayout(REVERSED);
    hook.rerender();
    expect(hook.current.order).toEqual([...HOME]);
    hook.unmount();
  });

  it("applies the order from another device once the screen loses focus", () => {
    mockSettings.data = withLayout();
    const hook = mount();
    mockSettings.data = withLayout(REVERSED);
    hook.rerender();
    mockFocused.value = false;
    hook.rerender();
    expect(hook.current.order).toEqual(REVERSED);
    // ...so it is already in place when the user comes back.
    mockFocused.value = true;
    hook.rerender();
    expect(hook.current.order).toEqual(REVERSED);
    hook.unmount();
  });

  it("applies an order that arrived while the screen was out of sight immediately", () => {
    mockSettings.data = withLayout();
    mockFocused.value = false;
    const hook = mount();
    mockSettings.data = withLayout(REVERSED);
    hook.rerender();
    expect(hook.current.order).toEqual(REVERSED);
    hook.unmount();
  });

  it("commit applies the order at once and saves it per screen", () => {
    mockSettings.data = withLayout();
    const hook = mount();
    act(() => hook.current.commit(REVERSED));
    expect(hook.current.order).toEqual(REVERSED);
    expect(mockMutate).toHaveBeenCalledWith(
      { cardLayouts: { home: REVERSED } },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    hook.unmount();
  });

  it("committing the default order saves an empty list (reset)", () => {
    mockSettings.data = withLayout(REVERSED);
    const hook = mount();
    act(() => hook.current.commit([...HOME]));
    expect(hook.current.order).toEqual([...HOME]);
    expect(mockMutate).toHaveBeenCalledWith(
      { cardLayouts: { home: [] } },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    hook.unmount();
  });

  it("keeps a committed order while the (optimistic) server copy catches up", () => {
    mockSettings.data = withLayout();
    const hook = mount();
    act(() => hook.current.commit(REVERSED));
    mockSettings.data = withLayout(REVERSED);
    hook.rerender();
    expect(hook.current.order).toEqual(REVERSED);
    hook.unmount();
  });

  describe("a new device with nothing cached", () => {
    it("does not wait when the settings fetch has failed", () => {
      mockSettings.isError = true;
      const hook = mount();
      expect(hook.current.ready).toBe(true);
      expect(hook.current.order).toEqual([...HOME]);
      hook.unmount();
    });

    it("does not wait when the fetch is paused offline (a cold start without a connection)", () => {
      mockSettings.fetchStatus = "paused";
      const hook = mount();
      expect(hook.current.ready).toBe(true);
      expect(hook.current.order).toEqual([...HOME]);
      mockSettings.data = withLayout(REVERSED);
      hook.rerender();
      // The saved order arrives later: held back until the screen is next out of sight.
      expect(hook.current.order).toEqual([...HOME]);
      mockFocused.value = false;
      hook.rerender();
      expect(hook.current.order).toEqual(REVERSED);
      hook.unmount();
    });

    it("is not ready, then takes the saved order if it arrives within a second", () => {
      const hook = mount();
      expect(hook.current.ready).toBe(false);
      act(() => void jest.advanceTimersByTime(CARD_ORDER_WAIT_MS - 100));
      expect(hook.current.ready).toBe(false);
      mockSettings.data = withLayout(REVERSED);
      hook.rerender();
      expect(hook.current.ready).toBe(true);
      expect(hook.current.order).toEqual(REVERSED);
      hook.unmount();
    });

    it("falls back to the default order after a second and keeps it for the visit", () => {
      const hook = mount();
      act(() => void jest.advanceTimersByTime(CARD_ORDER_WAIT_MS + 10));
      expect(hook.current.ready).toBe(true);
      expect(hook.current.order).toEqual([...HOME]);
      // The saved order shows up late: not applied while the user is looking at the screen...
      mockSettings.data = withLayout(REVERSED);
      hook.rerender();
      expect(hook.current.order).toEqual([...HOME]);
      // ...but next time they come to it.
      mockFocused.value = false;
      hook.rerender();
      expect(hook.current.order).toEqual(REVERSED);
      hook.unmount();
    });
  });

  describe("a card order save that fails", () => {
    const rejected = (status: number) =>
      new AxiosError("x", "ERR_BAD_RESPONSE", undefined, undefined, { status } as never);

    it("a rejection puts the previous order back at once, while the screen is still focused", () => {
      mockSettings.data = withLayout(REVERSED);
      const hook = mount();
      act(() => hook.current.commit([...HOME]));
      expect(hook.current.order).toEqual([...HOME]);
      // The mutation's own onError has restored the cache before this callback runs.
      hook.queryClient.setQueryData(settingsQueryKeys.user("user-1"), withLayout(REVERSED));
      const options = mockMutate.mock.calls[0][1] as { onError: (e: unknown) => void };
      act(() => options.onError(rejected(422)));
      expect(hook.current.order).toEqual(REVERSED);
      expect(mockFocused.value).toBe(true);
      hook.unmount();
    });

    it.each([
      ["offline", new AxiosError("Network Error", "ERR_NETWORK")],
      ["a 503", rejected(503)],
      ["a 429", rejected(429)],
    ])("keeps the new order when the save will be retried (%s)", (_name, error) => {
      mockSettings.data = withLayout();
      const hook = mount();
      act(() => hook.current.commit(REVERSED));
      const options = mockMutate.mock.calls[0][1] as { onError: (e: unknown) => void };
      act(() => options.onError(error));
      expect(hook.current.order).toEqual(REVERSED);
      hook.unmount();
    });
  });

  it("publishes the order on screen for the guided tour", () => {
    mockSettings.data = withLayout(REVERSED);
    const hook = mount();
    expect(getAppliedCardOrder("home")).toEqual(REVERSED);
    hook.unmount();
  });

  it("asks for stale settings when the screen is focused", () => {
    mockSettings.data = withLayout();
    const hook = mount();
    expect(hook.refetch).toHaveBeenCalledWith(
      expect.objectContaining({ stale: true }),
    );
    hook.unmount();
  });

  it("does not refetch settings while a save is running (it could bring back the old order)", () => {
    mockSettings.data = withLayout();
    const hook = mount({ saving: true });
    expect(hook.refetch).not.toHaveBeenCalled();
    hook.unmount();
  });
});
