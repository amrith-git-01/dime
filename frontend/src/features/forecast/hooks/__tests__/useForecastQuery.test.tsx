import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactElement } from "react";

import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { fetchForecast } from "../../api/forecastApi";
import { forecastQueryKeys } from "../../queryKeys";
import type { ForecastResponse } from "../../types";
import { useForecastQuery } from "../useForecastQuery";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("../../api/forecastApi", () => ({ fetchForecast: jest.fn() }));
jest.mock("@/hooks/useSessionUserId", () => ({
  useSessionUserId: () => ({ userId: "user-a" }),
}));
jest.mock("@/utils/deviceTimezone", () => ({
  getDeviceIanaTimezone: () => "Asia/Kolkata",
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const mockedFetch = fetchForecast as jest.Mock;

const forecast = { year: 2026, month: 10, summary: "On track" } as ForecastResponse;

let latest: ReturnType<typeof useForecastQuery> | undefined;
let args = { year: 0, monthIndex0: 0 };
function Probe() {
  latest = useForecastQuery(args.year, args.monthIndex0);
  // A screen reads the data while rendering; that is what makes the query re-render on a change.
  void latest.data;
  return null;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

describe("useForecastQuery", () => {
  let client: QueryClient;
  let renderer: { unmount: () => void };
  const now = new Date();

  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue(forecast);
    latest = undefined;
    client = createTestQueryClient();
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    client.clear();
    onlineManager.setOnline(true);
  });

  async function mount(year: number, monthIndex0: number) {
    args = { year, monthIndex0 };
    await act(async () => {
      renderer = create(createElement(QueryClientProvider, { client }, createElement(Probe)));
    });
    await settle();
  }

  it("fetches the current month with the device timezone and keys it by user, month and timezone", async () => {
    await mount(now.getFullYear(), now.getMonth());
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledWith({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      timezone: "Asia/Kolkata",
    });
    expect(latest?.data).toBe(forecast);
    expect(
      client.getQueryData(
        forecastQueryKeys.month("user-a", now.getFullYear(), now.getMonth() + 1, "Asia/Kolkata"),
      ),
    ).toBe(forecast);
  });

  it("hands real data through untouched, so an optimistic cache update shows at once", async () => {
    await mount(now.getFullYear(), now.getMonth());
    expect(latest?.data).toBe(forecast);
    const patched = { ...forecast, summary: "Patched" } as ForecastResponse;
    await act(async () => {
      client.setQueryData(
        forecastQueryKeys.month("user-a", now.getFullYear(), now.getMonth() + 1, "Asia/Kolkata"),
        patched,
      );
    });
    await settle();
    expect(latest?.data).toEqual(patched);
  });

  it("stays off for any other month", async () => {
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    await mount(previous.getFullYear(), previous.getMonth());
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(latest?.data).toBeUndefined();
    expect(latest?.fetchStatus).toBe("idle");
  });
});
