import { renderHookWithClient } from "@/test-utils/renderHookWithClient";
import { createTestQueryClient } from "@/test-utils/testQueryClient";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import type { ReportListItem } from "../types";
import { useReportBanner } from "../hooks/useReportBanner";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/hooks/useSessionUserId", () => ({
  useSessionUserId: () => ({ userId: "u1" }),
}));
const mockList = { value: { data: undefined as ReportListItem[] | undefined } };
jest.mock("../hooks/useReportsList", () => ({
  useReportsList: () => mockList.value,
}));

const OCTOBER: ReportListItem = {
  period_key: "2026-10",
  year: 2026,
  month: 10,
  debit_count: 30,
  viewed: false,
};

describe("useReportBanner", () => {
  beforeEach(() => {
    resetMockMmkv();
    jest.useFakeTimers();
    // 4 Nov 2026, noon in India.
    jest.setSystemTime(new Date(Date.UTC(2026, 10, 4, 6, 30)));
    mockList.value = { data: [OCTOBER] };
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function render() {
    return renderHookWithClient(createTestQueryClient(), () => useReportBanner());
  }

  it("offers last month's unviewed report in the first week", () => {
    const hook = render();
    expect(hook.current.periodKey).toBe("2026-10");
    expect(hook.current.monthLabel).toBe("October");
  });

  it("offers nothing after the first week", () => {
    jest.setSystemTime(new Date(Date.UTC(2026, 10, 9, 6, 30)));
    expect(render().current.periodKey).toBeNull();
  });

  it("offers nothing without reports", () => {
    mockList.value = { data: undefined };
    expect(render().current.periodKey).toBeNull();
  });

  it("hides itself when the IST day turns 8, with no other render to trigger it", () => {
    // 7 Nov, 23:00 in India: the last evening of the window.
    jest.setSystemTime(new Date(Date.UTC(2026, 10, 7, 17, 30)));
    const hook = render();
    expect(hook.current.periodKey).toBe("2026-10");

    hook.act(() => {
      jest.advanceTimersByTime(59 * 60 * 1000);
    });
    expect(hook.current.periodKey).toBe("2026-10");

    // India's midnight passes.
    hook.act(() => {
      jest.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(hook.current.periodKey).toBeNull();
  });

  it("shows itself when the IST day turns 1", () => {
    // 31 Oct, 23:30 in India: October is not over yet, so its report is not on offer.
    jest.setSystemTime(new Date(Date.UTC(2026, 9, 31, 18, 0)));
    const hook = render();
    expect(hook.current.periodKey).toBeNull();
    // India's midnight: it is 1 Nov and the October report is last month's.
    hook.act(() => {
      jest.advanceTimersByTime(31 * 60 * 1000);
    });
    expect(hook.current.periodKey).toBe("2026-10");
  });

  it("hides on dismiss, and stays hidden on the next visit", () => {
    const hook = render();
    hook.act(() => {
      hook.current.dismiss();
    });
    expect(hook.current.periodKey).toBeNull();
    // A new screen instance (another visit) reads the device flag.
    expect(render().current.periodKey).toBeNull();
  });
});
