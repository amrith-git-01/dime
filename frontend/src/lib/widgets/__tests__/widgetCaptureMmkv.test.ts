import { resetMockMmkv } from "@/test-utils/mockMmkv";

import {
  addPendingCaptureJob,
  clearWidgetCaptureData,
  currentWidgetCaptureStatus,
  readPendingCaptureJobs,
  readWidgetCaptureStatus,
  removePendingCaptureJob,
  WIDGET_CAPTURE_STATUS_TTL_MS,
  writeWidgetCaptureStatus,
  type WidgetCaptureStatus,
} from "../widgetCaptureMmkv";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const NOW = Date.now();
const STATUS: WidgetCaptureStatus = {
  kind: "reading",
  text: "Reading receipt…",
  at: NOW,
  userId: "user-a",
  jobId: "job-1",
};

describe("widget capture status", () => {
  beforeEach(resetMockMmkv);

  it("round-trips the status and clears it", () => {
    expect(readWidgetCaptureStatus()).toBeNull();
    writeWidgetCaptureStatus(STATUS);
    expect(readWidgetCaptureStatus()).toEqual(STATUS);
    writeWidgetCaptureStatus(null);
    expect(readWidgetCaptureStatus()).toBeNull();
  });

  it("is current for its own account for ten minutes", () => {
    writeWidgetCaptureStatus(STATUS);
    expect(currentWidgetCaptureStatus("user-a", NOW + 1_000)).toEqual(STATUS);
    expect(currentWidgetCaptureStatus("user-a", NOW + WIDGET_CAPTURE_STATUS_TTL_MS)).toEqual(STATUS);
    expect(currentWidgetCaptureStatus("user-a", NOW + WIDGET_CAPTURE_STATUS_TTL_MS + 1)).toBeNull();
  });

  it("is never shown to another account or without one", () => {
    writeWidgetCaptureStatus(STATUS);
    expect(currentWidgetCaptureStatus("user-b", NOW)).toBeNull();
    expect(currentWidgetCaptureStatus(undefined, NOW)).toBeNull();
  });
});

describe("pending capture jobs", () => {
  beforeEach(resetMockMmkv);

  it("keeps jobs in upload order, without duplicates", () => {
    addPendingCaptureJob({ id: "a", userId: "user-a", at: NOW });
    addPendingCaptureJob({ id: "b", userId: "user-a", at: NOW });
    addPendingCaptureJob({ id: "a", userId: "user-a", at: NOW + 1 });
    expect(readPendingCaptureJobs(NOW + 2).map((job) => job.id)).toEqual(["b", "a"]);
  });

  it("removes a settled job", () => {
    addPendingCaptureJob({ id: "a", userId: "user-a", at: NOW });
    addPendingCaptureJob({ id: "b", userId: "user-a", at: NOW });
    removePendingCaptureJob("a");
    expect(readPendingCaptureJobs(NOW).map((job) => job.id)).toEqual(["b"]);
    removePendingCaptureJob("b");
    expect(readPendingCaptureJobs(NOW)).toEqual([]);
  });

  it("forgets a job nobody saw finish after half an hour", () => {
    addPendingCaptureJob({ id: "old", userId: "user-a", at: NOW });
    expect(readPendingCaptureJobs(NOW + 30 * 60_000)).toHaveLength(1);
    expect(readPendingCaptureJobs(NOW + 30 * 60_000 + 1)).toEqual([]);
  });

  it("keeps only the ten newest", () => {
    for (let i = 0; i < 12; i += 1) {
      addPendingCaptureJob({ id: `job-${i}`, userId: "user-a", at: NOW });
    }
    const ids = readPendingCaptureJobs(NOW).map((job) => job.id);
    expect(ids).toHaveLength(10);
    expect(ids[0]).toBe("job-2");
  });

  it("is wiped with the status on sign-out", () => {
    writeWidgetCaptureStatus(STATUS);
    addPendingCaptureJob({ id: "a", userId: "user-a", at: Date.now() });
    clearWidgetCaptureData();
    expect(readWidgetCaptureStatus()).toBeNull();
    expect(readPendingCaptureJobs()).toEqual([]);
  });
});
