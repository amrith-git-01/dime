import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactElement } from "react";

import { fetchMe } from "../../api/meApi";
import { useCurrentUserProfileQuery } from "../useCurrentUserProfileQuery";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("../../api/meApi", () => ({ fetchMe: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const mockedFetchMe = fetchMe as jest.Mock;

let latest: ReturnType<typeof useCurrentUserProfileQuery> | undefined;
function Probe() {
  latest = useCurrentUserProfileQuery("user-a");
  return null;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

describe("useCurrentUserProfileQuery (the root route gate)", () => {
  let client: QueryClient;
  let renderer: { unmount: () => void };

  beforeEach(() => {
    mockedFetchMe.mockReset();
    latest = undefined;
    // The app-wide default is one retry; the gate must not inherit it.
    client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 1, gcTime: Infinity } } });
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    client.clear();
    onlineManager.setOnline(true);
  });

  async function mount() {
    await act(async () => {
      renderer = create(createElement(QueryClientProvider, { client }, createElement(Probe)));
    });
    await settle();
  }

  it("makes one attempt and settles with an error when /me fails", async () => {
    mockedFetchMe.mockRejectedValue(new Error("Network Error"));
    await mount();
    expect(mockedFetchMe).toHaveBeenCalledTimes(1);
    expect(latest?.isError).toBe(true);
    expect(latest?.isFetched).toBe(true);
  });

  it("still asks while the device reports offline, so the gate cannot wait for the network", async () => {
    onlineManager.setOnline(false);
    mockedFetchMe.mockRejectedValue(new Error("Network Error"));
    await mount();
    expect(mockedFetchMe).toHaveBeenCalledTimes(1);
    expect(latest?.isError).toBe(true);
  });

  it("returns the profile when /me succeeds", async () => {
    mockedFetchMe.mockResolvedValue({ id: "user-a", username: "sam" });
    await mount();
    expect(latest?.data).toMatchObject({ username: "sam" });
    expect(latest?.isError).toBe(false);
  });
});
