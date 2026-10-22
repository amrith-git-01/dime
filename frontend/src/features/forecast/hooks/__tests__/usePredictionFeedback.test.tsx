import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactElement } from "react";

import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { postPredictionFeedback } from "../../api/forecastApi";
import { forecastQueryKeys } from "../../queryKeys";
import type { ForecastResponse } from "../../types";
import { usePredictionFeedback } from "../usePredictionFeedback";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("../../api/forecastApi", () => ({ postPredictionFeedback: jest.fn() }));
jest.mock("@/hooks/useSessionUserId", () => ({
  useSessionUserId: () => ({ userId: "user-a" }),
}));
jest.mock("@/utils/deviceTimezone", () => ({
  getDeviceIanaTimezone: () => "Asia/Kolkata",
}));
const mockShowToast = jest.fn();
jest.mock("@/features/toast/useToast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

/* eslint-disable @typescript-eslint/no-require-imports -- the renderer ships without types */
const { act, create } = require("react-test-renderer") as {
  act: (callback: () => Promise<void> | void) => Promise<void>;
  create: (element: ReactElement) => { unmount: () => void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const mockedPost = postPredictionFeedback as jest.Mock;

const KEY = forecastQueryKeys.month("user-a", 2026, 10, "Asia/Kolkata");
const OTHER_USER_KEY = forecastQueryKeys.month("user-b", 2026, 10, "Asia/Kolkata");

const seeded = (): ForecastResponse =>
  ({
    upcoming: [
      { id: "u1", kind: "likely", name: "Swiggy", amount: "350.00", date: "2026-10-23", payeeKey: "swiggy" },
      { id: "u2", kind: "likely", name: "Zomato", amount: "500.00", date: "2026-10-24", payeeKey: "zomato" },
    ],
    watch: [{ id: "sub:spotify", kind: "subscription_candidate", text: "x", payeeKey: "spotify" }],
  }) as ForecastResponse;

let mutation: ReturnType<typeof usePredictionFeedback> | undefined;
function Probe() {
  mutation = usePredictionFeedback();
  return null;
}
const current = () => {
  if (!mutation) throw new Error("not rendered");
  return mutation;
};

describe("usePredictionFeedback", () => {
  let client: QueryClient;
  let renderer: { unmount: () => void };

  beforeEach(async () => {
    mockedPost.mockReset();
    mockShowToast.mockReset();
    client = createTestQueryClient();
    client.setQueryData(KEY, seeded());
    client.setQueryData(OTHER_USER_KEY, seeded());
    await act(async () => {
      renderer = create(createElement(QueryClientProvider, { client }, createElement(Probe)));
    });
  });

  afterEach(async () => {
    await act(async () => {
      renderer.unmount();
    });
    client.clear();
  });

  it("takes a dismissed likely spend off the cached forecast while the request is in flight", async () => {
    let finish!: () => void;
    mockedPost.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await act(async () => {
      current().mutate({ targetKind: "payee", targetId: "swiggy", verdict: "dismiss" });
    });

    const during = client.getQueryData<ForecastResponse>(KEY);
    expect(during?.upcoming.map((item) => item.id)).toEqual(["u2"]);
    // Another account's cache is never touched.
    expect(client.getQueryData<ForecastResponse>(OTHER_USER_KEY)?.upcoming).toHaveLength(2);
    expect(mockedPost).toHaveBeenCalledWith({
      targetKind: "payee",
      targetId: "swiggy",
      verdict: "dismiss",
      timezone: "Asia/Kolkata",
    });

    await act(async () => {
      finish();
    });
  });

  it("says so and refetches when the request fails, rather than restoring a snapshot", async () => {
    mockedPost.mockRejectedValue(new Error("boom"));
    const spy = jest.spyOn(client, "invalidateQueries");
    await act(async () => {
      current().mutate({ targetKind: "subscription_candidate", targetId: "spotify", verdict: "dismiss" });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
    expect(spy).toHaveBeenCalledWith({ queryKey: forecastQueryKeys.all });
  });

  it("keeps the second answer's removal when only the first one fails", async () => {
    mockedPost.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
    await act(async () => {
      current().mutate({ targetKind: "payee", targetId: "swiggy", verdict: "dismiss" });
      current().mutate({ targetKind: "payee", targetId: "zomato", verdict: "dismiss" });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(mockedPost).toHaveBeenCalledTimes(2);
    // Nothing put Swiggy back or took Zomato away: the cache is left to the refetch (a test cache has no query function).
    expect(client.getQueryData<ForecastResponse>(KEY)?.upcoming).toEqual([]);
    expect(mockShowToast).toHaveBeenCalledTimes(1);
  });

  it("refetches the forecast once the answer is in", async () => {
    mockedPost.mockResolvedValue(undefined);
    const spy = jest.spyOn(client, "invalidateQueries");
    await act(async () => {
      current().mutate({ targetKind: "payee", targetId: "zomato", verdict: "confirm" });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: forecastQueryKeys.all });
    // A confirm changes nothing on screen.
    expect(client.getQueryData<ForecastResponse>(KEY)?.upcoming).toHaveLength(2);
  });

  it("sends an unusual spend's one-off as one request (the server hides the card itself)", async () => {
    mockedPost.mockResolvedValue(undefined);
    await act(async () => {
      current().mutate({ targetKind: "unusual_txn", targetId: "txn-1", verdict: "one_off" });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mockedPost.mock.calls.map(([body]) => body.verdict)).toEqual(["one_off"]);
  });

  it("never sends a guided-tour sample", async () => {
    await act(async () => {
      current().mutate({
        targetKind: "unusual_txn",
        targetId: "5a3b1e00-0000-4000-8000-000000000001",
        verdict: "not_one_off",
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });
});
