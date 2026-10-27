import type { QueryClient } from "@tanstack/react-query";

import { createTestQueryClient } from "@/test-utils/testQueryClient";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";

import { FULL_SNAPSHOT } from "../__fixtures__/reportFixtures";
import { fetchReport, fetchReportList, markReportViewed } from "../api/reportsApi";
import { useMarkReportViewed } from "../hooks/useMarkReportViewed";
import { useReport } from "../hooks/useReport";
import { useReportsList } from "../hooks/useReportsList";
import { REPORT_CACHE_SHAPE, reportQueryKeys } from "../queryKeys";
import type { ReportListItem } from "../types";

jest.mock("@/lib/api/dimeApi", () => ({ dimeApi: { get: jest.fn(), post: jest.fn() } }));
// The network functions are stubs; the mappers the hooks select with are the real ones.
jest.mock("../api/reportsApi", () => ({
  ...jest.requireActual("../api/reportsApi"),
  fetchReportList: jest.fn(),
  fetchReport: jest.fn(),
  markReportViewed: jest.fn(),
}));
jest.mock("@/hooks/useSessionUserId", () => ({
  useSessionUserId: () => ({ userId: "u1" }),
}));

const list = jest.mocked(fetchReportList);
const one = jest.mocked(fetchReport);
const viewed = jest.mocked(markReportViewed);

const ITEMS: ReportListItem[] = [
  { period_key: "2026-10", year: 2026, month: 10, debit_count: 41, viewed: false },
  { period_key: "2026-09", year: 2026, month: 9, debit_count: 22, viewed: true },
];

async function flush(hook: { act: (cb: () => Promise<void>) => unknown }) {
  // Query results are delivered on timers and microtasks: give them a few turns.
  for (let turn = 0; turn < 4; turn += 1) {
    await hook.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe("report hooks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.resetAllMocks();
    queryClient = createTestQueryClient();
  });
  afterEach(() => queryClient.clear());

  it("loads the list under the user's key", async () => {
    list.mockResolvedValue(ITEMS);
    const hook = renderHookWithClient(queryClient, () => useReportsList());
    await flush(hook);
    expect(hook.current.data).toEqual(ITEMS);
    expect(queryClient.getQueryData(reportQueryKeys.list("u1"))).toEqual(ITEMS);
  });

  it("loads a snapshot, and keeps a 404 as data (null), not as an error", async () => {
    one.mockResolvedValueOnce(FULL_SNAPSHOT);
    const found = renderHookWithClient(queryClient, () => useReport("2026-10"));
    await flush(found);
    expect(found.current.data).toEqual(FULL_SNAPSHOT);

    one.mockResolvedValueOnce(null);
    const missing = renderHookWithClient(queryClient, () => useReport("2026-07"));
    await flush(missing);
    expect(missing.current.data).toBeNull();
    expect(missing.current.isError).toBe(false);
    expect(missing.current.isSuccess).toBe(true);
  });

  it("does not ask the server for the bundled sample", async () => {
    const hook = renderHookWithClient(queryClient, () => useReport("sample"));
    await flush(hook);
    expect(one).not.toHaveBeenCalled();
    expect(hook.current.fetchStatus).toBe("idle");
  });

  it("never refetches a cached snapshot, but asks again for a missing one", async () => {
    queryClient.setQueryData(reportQueryKeys.period("u1", "2026-10"), FULL_SNAPSHOT);
    queryClient.setQueryData(reportQueryKeys.period("u1", "2026-07"), null);
    one.mockResolvedValue(FULL_SNAPSHOT);
    const cached = renderHookWithClient(queryClient, () => useReport("2026-10"));
    await flush(cached);
    expect(one).not.toHaveBeenCalledWith("2026-10");
    const gone = renderHookWithClient(queryClient, () => useReport("2026-07"));
    await flush(gone);
    expect(one).toHaveBeenCalledWith("2026-07");
  });

  it("maps what is cached, persisted copies included, before anyone reads it", async () => {
    const old = { version: 1, period_key: "2026-10", year: 2026, month: 10, debit_count: 3 };
    queryClient.setQueryData(reportQueryKeys.period("u1", "2026-10"), old);
    queryClient.setQueryData(reportQueryKeys.list("u1"), [
      ...ITEMS,
      { period_key: "junk" },
      null,
    ]);
    const snapshot = renderHookWithClient(queryClient, () => useReport("2026-10"));
    await flush(snapshot);
    expect(snapshot.current.data?.weekday.totals).toHaveLength(7);
    expect(snapshot.current.data?.win).toEqual({ kind: "none" });
    expect(snapshot.current.data?.categories).toEqual([]);
    // It is a snapshot, so it is not fetched again.
    expect(one).not.toHaveBeenCalled();

    const rows = renderHookWithClient(queryClient, () => useReportsList());
    await flush(rows);
    expect(rows.current.data).toEqual(ITEMS);
  });

  it("treats a cached value that is not a snapshot as missing and asks the server", async () => {
    queryClient.setQueryData(reportQueryKeys.period("u1", "2026-10"), { hello: "world" });
    one.mockResolvedValue(FULL_SNAPSHOT);
    const hook = renderHookWithClient(queryClient, () => useReport("2026-10"));
    // Until the answer arrives the bad copy reads as "no snapshot", never as a broken one.
    expect(hook.current.data).toBeNull();
    await flush(hook);
    expect(one).toHaveBeenCalledWith("2026-10");
    expect(hook.current.data).toEqual(FULL_SNAPSHOT);
  });

  it("keys the cache by shape, so a shape change never reads old entries", () => {
    expect(reportQueryKeys.period("u1", "2026-10")).toEqual([
      "reports",
      `period.v${REPORT_CACHE_SHAPE}`,
      "u1",
      "2026-10",
    ]);
    expect(reportQueryKeys.list("u1")[1]).toBe(`list.v${REPORT_CACHE_SHAPE}`);
    expect(reportQueryKeys.list("u1")[0]).toBe(reportQueryKeys.all[0]);
  });

  it("does not ask the server for a malformed period", async () => {
    const hook = renderHookWithClient(queryClient, () => useReport("2026-13"));
    await flush(hook);
    expect(one).not.toHaveBeenCalled();
    expect(hook.current.fetchStatus).toBe("idle");
  });

  it("marks a report viewed optimistically, then posts it", async () => {
    let finish: () => void = () => undefined;
    viewed.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    queryClient.setQueryData(reportQueryKeys.list("u1"), ITEMS);
    const hook = renderHookWithClient(queryClient, () => useMarkReportViewed());

    await hook.act(async () => {
      hook.current.mutate("2026-10");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The list already says viewed while the request is still in flight.
    const during = queryClient.getQueryData<ReportListItem[]>(reportQueryKeys.list("u1"));
    expect(during?.find((item) => item.period_key === "2026-10")?.viewed).toBe(true);
    expect(during?.find((item) => item.period_key === "2026-09")?.viewed).toBe(true);
    expect(viewed).toHaveBeenCalledWith("2026-10");

    await hook.act(async () => {
      finish();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });

  it("puts the list back when the post fails", async () => {
    viewed.mockRejectedValueOnce(new Error("offline"));
    queryClient.setQueryData(reportQueryKeys.list("u1"), ITEMS);
    const hook = renderHookWithClient(queryClient, () => useMarkReportViewed());

    await hook.act(async () => {
      hook.current.mutate("2026-10");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush(hook);

    const after = queryClient.getQueryData<ReportListItem[]>(reportQueryKeys.list("u1"));
    expect(after?.find((item) => item.period_key === "2026-10")?.viewed).toBe(false);
  });

  it("leaves a missing list alone", async () => {
    viewed.mockResolvedValueOnce(undefined);
    const hook = renderHookWithClient(queryClient, () => useMarkReportViewed());
    await hook.act(async () => {
      hook.current.mutate("2026-10");
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(queryClient.getQueryData(reportQueryKeys.list("u1"))).toBeUndefined();
  });
});
