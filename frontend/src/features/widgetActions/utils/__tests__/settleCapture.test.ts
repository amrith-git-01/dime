import {
  addPendingCaptureJob,
  readPendingCaptureJobs,
  readWidgetCaptureStatus,
  writeWidgetCaptureStatus,
} from "@/lib/widgets/widgetCaptureMmkv";
import { reportError } from "@/lib/reportError";
import { onWidgetTransactionsChanged } from "@/lib/widgets/widgetCaptureEvents";
import { refreshWidgetSnapshotFromApi } from "@/lib/widgets/refreshWidgetSnapshotFromApi";
import { resetMockMmkv } from "@/test-utils/mockMmkv";
import { refreshWidgets } from "@/widgets/refreshWidgets";

import { fetchIngestJob } from "../../api/ingestJobApi";
import { addedText } from "../captureText";
import { applyCaptureOutcome, markCaptureAdded, settlePendingCaptures } from "../settleCapture";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/widgets/refreshWidgets", () => ({ refreshWidgets: jest.fn() }));
jest.mock("@/lib/widgets/refreshWidgetSnapshotFromApi", () => ({
  refreshWidgetSnapshotFromApi: jest.fn(),
}));
jest.mock("@/lib/reportError", () => ({ reportError: jest.fn() }));
jest.mock("../../api/ingestJobApi", () => ({ fetchIngestJob: jest.fn() }));

const TRANSACTION = {
  id: "tx-1",
  amount: "250.00",
  type: "debit" as const,
  counterparty_name: "Swiggy",
  category: "Food",
};

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function axiosError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { isAxiosError: true, response: { status } });
}

beforeEach(() => {
  resetMockMmkv();
  jest.clearAllMocks();
  jest.mocked(refreshWidgetSnapshotFromApi).mockResolvedValue(true);
});

describe("markCaptureAdded", () => {
  it("shows the status and tells the app at once; the snapshot refreshes in the background", async () => {
    const heard = jest.fn();
    const off = onWidgetTransactionsChanged(heard);
    let finishRefresh: (changed: boolean) => void = () => undefined;
    jest.mocked(refreshWidgetSnapshotFromApi).mockReturnValue(
      new Promise<boolean>((resolve) => {
        finishRefresh = resolve;
      }),
    );

    markCaptureAdded({ userId: "user-a", text: "Added ₹20 · Chai" });
    // Nothing waited for the (still pending) snapshot request.
    expect(readWidgetCaptureStatus()).toMatchObject({ kind: "added", text: "Added ₹20 · Chai" });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(refreshWidgets).toHaveBeenCalledTimes(1);
    expect(refreshWidgetSnapshotFromApi).toHaveBeenCalledWith("user-a");

    finishRefresh(true);
    await flushPromises();
    expect(refreshWidgets).toHaveBeenCalledTimes(2);
    off();
  });

  it("logs a failing snapshot refresh instead of throwing, and still redraws", async () => {
    jest.mocked(refreshWidgetSnapshotFromApi).mockRejectedValue(new Error("offline"));
    expect(() => markCaptureAdded({ userId: "user-a", text: "Added ₹20 · Chai" })).not.toThrow();
    await flushPromises();
    expect(reportError).toHaveBeenCalled();
    expect(refreshWidgets).toHaveBeenCalledTimes(2);
  });
});

describe("applyCaptureOutcome", () => {
  it("tells the running app when a capture settled as added, not when it failed", async () => {
    const heard = jest.fn();
    const off = onWidgetTransactionsChanged(heard);
    await applyCaptureOutcome({
      userId: "user-a",
      jobId: "job-1",
      outcome: { kind: "done", transaction: TRANSACTION },
    });
    expect(heard).toHaveBeenCalledTimes(1);
    await applyCaptureOutcome({ userId: "user-a", jobId: "job-1", outcome: { kind: "failed" } });
    expect(heard).toHaveBeenCalledTimes(1);
    off();
  });

  it("ignores a timeout", async () => {
    addPendingCaptureJob({ id: "job-1", userId: "user-a", at: Date.now() });
    await applyCaptureOutcome({ userId: "user-a", jobId: "job-1", outcome: { kind: "timeout" } });
    expect(readPendingCaptureJobs()).toHaveLength(1);
    expect(refreshWidgets).not.toHaveBeenCalled();
  });
});

describe("settlePendingCaptures", () => {
  beforeEach(() => {
    addPendingCaptureJob({ id: "job-1", userId: "user-a", at: Date.now() });
    writeWidgetCaptureStatus({
      kind: "reading",
      text: "Reading receipt…",
      at: Date.now(),
      userId: "user-a",
      jobId: "job-1",
    });
  });

  it("settles a finished job: status, snapshot, pending list", async () => {
    jest.mocked(fetchIngestJob).mockResolvedValue({ status: "done", transaction: TRANSACTION });
    await settlePendingCaptures("user-a", 5_000);
    expect(readWidgetCaptureStatus()).toMatchObject({
      kind: "added",
      text: addedText("250.00", "Swiggy"),
    });
    expect(readPendingCaptureJobs()).toEqual([]);
    expect(refreshWidgetSnapshotFromApi).toHaveBeenCalledWith("user-a");
  });

  it("asks once and leaves a job that is still being read", async () => {
    jest.mocked(fetchIngestJob).mockResolvedValue({ status: "processing" });
    await settlePendingCaptures("user-a", 5_000);
    expect(fetchIngestJob).toHaveBeenCalledTimes(1);
    expect(readPendingCaptureJobs()).toHaveLength(1);
    expect(readWidgetCaptureStatus()?.kind).toBe("reading");
  });

  it("marks a failed job failed", async () => {
    jest.mocked(fetchIngestJob).mockResolvedValue({ status: "failed" });
    await settlePendingCaptures("user-a", 5_000);
    expect(readWidgetCaptureStatus()?.kind).toBe("failed");
    expect(readPendingCaptureJobs()).toEqual([]);
  });

  it("keeps a job through a network error, but forgets one this account can never read", async () => {
    jest.mocked(fetchIngestJob).mockRejectedValueOnce(new Error("Network Error"));
    await settlePendingCaptures("user-a", 5_000);
    expect(readPendingCaptureJobs()).toHaveLength(1);

    jest.mocked(fetchIngestJob).mockRejectedValueOnce(axiosError(404));
    await settlePendingCaptures("user-a", 5_000);
    expect(readPendingCaptureJobs()).toEqual([]);
  });

  it("never touches another account's jobs, or anything when signed out", async () => {
    await settlePendingCaptures("user-b", 5_000);
    await settlePendingCaptures(undefined, 5_000);
    expect(fetchIngestJob).not.toHaveBeenCalled();
  });

  it("spends no more than its budget", async () => {
    await settlePendingCaptures("user-a", 0);
    expect(fetchIngestJob).not.toHaveBeenCalled();
  });
});
