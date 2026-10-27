import { useState } from "react";

import type { ReportListItem, ReportSnapshot } from "@/features/brokeReport/types";
import { FULL_SNAPSHOT } from "@/features/brokeReport/__fixtures__/reportFixtures";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { useBrokeReportScreenModel } from "../useBrokeReportScreenModel";

const mockNav = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  canGoBack: jest.fn(() => true),
};
const mockRoute = { params: { periodKey: "2026-10" } };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNav,
  useRoute: () => mockRoute,
}));

const mockReport = {
  value: {} as {
    data?: ReportSnapshot | null;
    isError?: boolean;
    fetchStatus?: string;
    refetch?: jest.Mock;
  },
};
jest.mock("@/features/brokeReport/hooks/useReport", () => ({
  useReport: () => mockReport.value,
}));
const mockList = { value: { data: undefined as ReportListItem[] | undefined } };
jest.mock("@/features/brokeReport/hooks/useReportsList", () => ({
  useReportsList: () => mockList.value,
}));
const mockMarkViewed = jest.fn();
jest.mock("@/features/brokeReport/hooks/useMarkReportViewed", () => ({
  useMarkReportViewed: () => ({ mutate: mockMarkViewed }),
}));
const mockSettings = { value: { data: { reportRoastLevel: "savage" } as { reportRoastLevel: string } | undefined } };
jest.mock("@/features/settings/hooks/useUserSettingsQuery", () => ({
  useUserSettingsQuery: () => mockSettings.value,
}));
// The barrel pulls in the whole player; the model only needs its types.
jest.mock("@/features/brokeReport/components", () => ({}));

function render() {
  return renderHookWithClient(createTestQueryClient(), () => useBrokeReportScreenModel());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRoute.params = { periodKey: "2026-10" };
  mockReport.value = { data: FULL_SNAPSHOT, refetch: jest.fn() };
  mockList.value = { data: [{ period_key: "2026-10", year: 2026, month: 10, debit_count: 41, viewed: false }] };
  mockSettings.value = { data: { reportRoastLevel: "savage" } };
  mockNav.canGoBack.mockReturnValue(true);
});

describe("useBrokeReportScreenModel", () => {
  it("is ready with the snapshot and the user's roast level", () => {
    const hook = render();
    expect(hook.current.status).toBe("ready");
    expect(hook.current.snapshot).toBe(FULL_SNAPSHOT);
    expect(hook.current.level).toBe("savage");
    expect(hook.current.isSample).toBe(false);
  });

  it("reads spicy until settings arrive", () => {
    mockSettings.value = { data: undefined };
    expect(render().current.level).toBe("spicy");
  });

  it("marks the report viewed once when it opens", () => {
    const hook = render();
    hook.act(() => undefined);
    expect(mockMarkViewed).toHaveBeenCalledTimes(1);
    expect(mockMarkViewed).toHaveBeenCalledWith("2026-10");
  });

  it("marks the next report too when the screen is reused for another period", () => {
    const hook = renderHookWithClient(createTestQueryClient(), () => {
      const [, setTick] = useState(0);
      return { model: useBrokeReportScreenModel(), rerender: () => setTick((n) => n + 1) };
    });
    expect(mockMarkViewed).toHaveBeenCalledTimes(1);
    expect(mockMarkViewed).toHaveBeenLastCalledWith("2026-10");

    // A link opens September on the same screen.
    mockRoute.params = { periodKey: "2026-09" };
    mockReport.value = { data: { ...FULL_SNAPSHOT, period_key: "2026-09", month: 9 }, refetch: jest.fn() };
    mockList.value = {
      data: [
        { period_key: "2026-10", year: 2026, month: 10, debit_count: 41, viewed: true },
        { period_key: "2026-09", year: 2026, month: 9, debit_count: 22, viewed: false },
      ],
    };
    hook.act(() => hook.current.rerender());
    expect(hook.current.model.snapshot?.period_key).toBe("2026-09");
    expect(mockMarkViewed).toHaveBeenCalledTimes(2);
    expect(mockMarkViewed).toHaveBeenLastCalledWith("2026-09");

    // Re-rendering the same period does not send it again.
    hook.act(() => hook.current.rerender());
    expect(mockMarkViewed).toHaveBeenCalledTimes(2);
  });

  it("is 'not available' for a malformed month, without asking the server", () => {
    mockRoute.params = { periodKey: "2026-13" };
    mockReport.value = { data: undefined, fetchStatus: "idle", refetch: jest.fn() };
    const hook = render();
    expect(hook.current.status).toBe("missing");
    expect(mockMarkViewed).not.toHaveBeenCalled();
  });

  it("is loading, not 'not available', while a bad cached copy is being replaced", () => {
    mockReport.value = { data: null, isError: false, fetchStatus: "fetching", refetch: jest.fn() };
    expect(render().current.status).toBe("loading");
  });

  it("does not mark a report the list already says was seen", () => {
    mockList.value = { data: [{ period_key: "2026-10", year: 2026, month: 10, debit_count: 41, viewed: true }] };
    render();
    expect(mockMarkViewed).not.toHaveBeenCalled();
  });

  it("shows the bundled sample without a server and never marks it viewed", () => {
    mockRoute.params = { periodKey: "sample" };
    mockReport.value = { data: undefined, fetchStatus: "idle", refetch: jest.fn() };
    const hook = render();
    expect(hook.current.status).toBe("ready");
    expect(hook.current.isSample).toBe(true);
    expect(hook.current.snapshot?.slides).toContain("closing");
    expect(mockMarkViewed).not.toHaveBeenCalled();
  });

  it("treats a 404 as 'not available', not an error", () => {
    mockReport.value = { data: null, isError: false, fetchStatus: "idle", refetch: jest.fn() };
    const hook = render();
    expect(hook.current.status).toBe("missing");
    expect(mockMarkViewed).not.toHaveBeenCalled();
  });

  it("is loading while the request runs, offline while it waits for the network, error on failure", () => {
    mockReport.value = { data: undefined, fetchStatus: "fetching", refetch: jest.fn() };
    expect(render().current.status).toBe("loading");
    mockReport.value = { data: undefined, fetchStatus: "paused", refetch: jest.fn() };
    expect(render().current.status).toBe("offline");
    mockReport.value = { data: undefined, isError: true, fetchStatus: "idle", refetch: jest.fn() };
    expect(render().current.status).toBe("error");
  });

  it("retries by refetching", () => {
    const refetch = jest.fn();
    mockReport.value = { data: undefined, isError: true, refetch };
    render().current.onRetry();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("closes by going back, or to the tabs when there is nothing to go back to", () => {
    render().current.onClose();
    expect(mockNav.goBack).toHaveBeenCalledTimes(1);
    mockNav.canGoBack.mockReturnValue(false);
    render().current.onClose();
    expect(mockNav.navigate).toHaveBeenCalledWith("MainTabs");
  });
});
