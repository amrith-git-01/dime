import {
  readPendingCaptureJobs,
  readWidgetCaptureStatus,
} from "@/lib/widgets/widgetCaptureMmkv";
import { refreshWidgetSnapshotFromApi } from "@/lib/widgets/refreshWidgetSnapshotFromApi";
import { resetMockMmkv } from "@/test-utils/mockMmkv";
import { refreshWidgets } from "@/widgets/refreshWidgets";

import { addedText } from "../captureText";
import type { CaptureOutcome } from "../pollIngestJob";
import { runCapture, type CapturePhase } from "../runCapture";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/widgets/refreshWidgets", () => ({ refreshWidgets: jest.fn() }));
jest.mock("@/lib/widgets/refreshWidgetSnapshotFromApi", () => ({
  refreshWidgetSnapshotFromApi: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/lib/reportError", () => ({ reportError: jest.fn() }));

const TRANSACTION = {
  id: "tx-1",
  amount: "250.00",
  type: "debit" as const,
  counterparty_name: "Swiggy",
  category: "Food",
};

function setup(outcome: CaptureOutcome, submit = jest.fn().mockResolvedValue({ jobId: "job-1" })) {
  const phases: [CapturePhase, string][] = [];
  const poll = jest.fn().mockResolvedValue(outcome);
  const run = () =>
    runCapture({
      userId: "user-a",
      kind: "receipt",
      submit,
      onPhase: (phase, text) => phases.push([phase, text]),
      poll,
    });
  return { phases, poll, submit, run };
}

describe("runCapture", () => {
  beforeEach(() => {
    resetMockMmkv();
    jest.clearAllMocks();
  });

  it("uploads, waits, and ends with the added transaction", async () => {
    const { phases, poll, run } = setup({ kind: "done", transaction: TRANSACTION });
    await expect(run()).resolves.toEqual({ phase: "added" });
    expect(phases).toEqual([
      ["uploading", "Uploading…"],
      ["reading", "Reading receipt…"],
      ["added", addedText("250.00", "Swiggy")],
    ]);
    expect(poll).toHaveBeenCalledWith("job-1", {});

    // The widget says the same, refreshes its numbers and no longer waits for the job.
    expect(readWidgetCaptureStatus()).toMatchObject({
      kind: "added",
      text: addedText("250.00", "Swiggy"),
      userId: "user-a",
    });
    expect(readPendingCaptureJobs()).toEqual([]);
    expect(refreshWidgetSnapshotFromApi).toHaveBeenCalledWith("user-a");
    expect(refreshWidgets).toHaveBeenCalled();
  });

  it("says 'Reading voice note…' for a voice capture", async () => {
    const texts: string[] = [];
    await runCapture({
      userId: "user-a",
      kind: "voice",
      submit: async () => ({ jobId: "job-2" }),
      onPhase: (_phase, text) => texts.push(text),
      poll: jest.fn().mockResolvedValue({ kind: "failed" }),
    });
    expect(texts).toContain("Reading voice note…");
  });

  it("marks the widget 'reading' with the job while it waits", async () => {
    let seen: unknown = null;
    const { run, poll } = setup({ kind: "timeout" });
    poll.mockImplementation(async () => {
      seen = { status: readWidgetCaptureStatus(), pending: readPendingCaptureJobs() };
      return { kind: "timeout" };
    });
    await run();
    expect(seen).toMatchObject({
      status: { kind: "reading", text: "Reading receipt…", jobId: "job-1", userId: "user-a" },
      pending: [{ id: "job-1", userId: "user-a" }],
    });
  });

  it("on timeout tells the user the widget will update, and leaves the job pending", async () => {
    const { phases, run } = setup({ kind: "timeout" });
    await expect(run()).resolves.toEqual({ phase: "timeout" });
    expect(phases.at(-1)).toEqual(["timeout", "Still reading. We'll update the widget"]);
    expect(readPendingCaptureJobs()).toHaveLength(1);
    expect(readWidgetCaptureStatus()?.kind).toBe("reading");
    expect(refreshWidgetSnapshotFromApi).not.toHaveBeenCalled();
  });

  it("on a failed job says so on the card and the widget, and stops waiting for it", async () => {
    const { phases, run } = setup({ kind: "failed" });
    await expect(run()).resolves.toEqual({ phase: "failed", failure: "job" });
    expect(phases.at(-1)?.[0]).toBe("failed");
    expect(readWidgetCaptureStatus()?.kind).toBe("failed");
    expect(readPendingCaptureJobs()).toEqual([]);
  });

  it("shows the server's message when the upload is refused (a daily limit)", async () => {
    const { phases, poll, run } = setup(
      { kind: "timeout" },
      jest.fn().mockRejectedValue(new Error("Daily receipt scan limit reached (10).")),
    );
    await expect(run()).resolves.toEqual({ phase: "failed", failure: "submit" });
    expect(phases.at(-1)).toEqual(["failed", "Daily receipt scan limit reached (10)."]);
    expect(readWidgetCaptureStatus()).toMatchObject({
      kind: "failed",
      text: "Daily receipt scan limit reached (10).",
    });
    expect(poll).not.toHaveBeenCalled();
    expect(readPendingCaptureJobs()).toEqual([]);
  });

  it("does not wait for a job when the server names none", async () => {
    const { phases, poll, run } = setup(
      { kind: "timeout" },
      jest.fn().mockResolvedValue({ jobId: null }),
    );
    await expect(run()).resolves.toEqual({ phase: "timeout" });
    expect(poll).not.toHaveBeenCalled();
    expect(phases.at(-1)?.[0]).toBe("timeout");
  });

  it("finishes 'Added' when the created transaction was deleted since", async () => {
    const { phases, run } = setup({ kind: "done", transaction: null });
    await run();
    expect(phases.at(-1)).toEqual(["added", "Added"]);
  });
});
