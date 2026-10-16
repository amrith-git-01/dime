import { isAxiosError } from "axios";

import { reportError } from "@/lib/reportError";
import { emitWidgetTransactionsChanged } from "@/lib/widgets/widgetCaptureEvents";
import { refreshWidgetSnapshotFromApi } from "@/lib/widgets/refreshWidgetSnapshotFromApi";
import {
  addPendingCaptureJob,
  readPendingCaptureJobs,
  removePendingCaptureJob,
  writeWidgetCaptureStatus,
  type WidgetCaptureStatus,
} from "@/lib/widgets/widgetCaptureMmkv";
import { refreshWidgets } from "@/widgets/refreshWidgets";

import { fetchIngestJob } from "../api/ingestJobApi";
import { addedText, CAPTURE_FAILED_TEXT } from "./captureText";
import { outcomeOfJob, type CaptureOutcome } from "./pollIngestJob";

/** The snapshot refresh must not hold the card or the headless task for long. */
const SNAPSHOT_REFRESH_TIMEOUT_MS = 5_000;
/** One request while settling pending jobs; the whole pass has its own budget. */
const SETTLE_REQUEST_TIMEOUT_MS = 4_000;
const MAX_JOBS_PER_PASS = 3;

function setStatus(status: Omit<WidgetCaptureStatus, "at">): void {
  writeWidgetCaptureStatus({ ...status, at: Date.now() });
}

/** The widget shows "Reading receipt…" until the job settles; the job is remembered in case the card closes first. */
export function markCaptureReading(input: { userId: string; jobId: string; text: string }): void {
  addPendingCaptureJob({ id: input.jobId, userId: input.userId, at: Date.now() });
  setStatus({ kind: "reading", text: input.text, userId: input.userId, jobId: input.jobId });
  refreshWidgets();
}

/** An upload or a manual add that failed before there was a job: the widget says so for a while. */
export function markCaptureFailed(input: { userId: string; text: string }): void {
  setStatus({ kind: "failed", text: input.text, userId: input.userId });
  refreshWidgets();
}

/**
 * A capture that needed no waiting (a manual add): the widget shows the result at once and the app,
 * if it is running, refetches. The snapshot refresh runs in the background and never fails the
 * caller: the card must not hold its Save spinner for it.
 */
export function markCaptureAdded(input: { userId: string; text: string }): void {
  setStatus({ kind: "added", text: input.text, userId: input.userId });
  refreshWidgets();
  emitWidgetTransactionsChanged();
  void refreshSnapshotAndWidget(input.userId);
}

/** Refreshes the snapshot from the API (so the month totals include the new transaction), then redraws the widget. */
async function refreshSnapshotAndWidget(userId: string): Promise<void> {
  try {
    await Promise.race([
      refreshWidgetSnapshotFromApi(userId),
      new Promise<void>((resolve) => setTimeout(resolve, SNAPSHOT_REFRESH_TIMEOUT_MS)),
    ]);
  } catch (error) {
    reportError(error, "widget snapshot refresh failed");
  }
  refreshWidgets();
}

/**
 * Records how a job ended: the widget's status line, the pending list, and (for a finished one) the
 * snapshot. A timeout changes nothing: the job stays pending for the widget's next update.
 * The snapshot refresh runs in the background unless `awaitSnapshot` (the headless task, which the
 * launcher may stop as soon as it returns).
 */
export async function applyCaptureOutcome(input: {
  userId: string;
  jobId: string;
  outcome: CaptureOutcome;
  awaitSnapshot?: boolean;
}): Promise<void> {
  const { userId, jobId, outcome } = input;
  if (outcome.kind === "timeout") {
    return;
  }
  removePendingCaptureJob(jobId);
  if (outcome.kind === "failed") {
    setStatus({ kind: "failed", text: CAPTURE_FAILED_TEXT, userId });
    refreshWidgets();
    return;
  }
  const { transaction } = outcome;
  setStatus({
    kind: "added",
    text: transaction
      ? addedText(transaction.amount, transaction.counterparty_name ?? transaction.category, transaction.type)
      : "Added",
    userId,
  });
  refreshWidgets();
  emitWidgetTransactionsChanged();
  const refresh = refreshSnapshotAndWidget(userId);
  if (input.awaitSnapshot) {
    await refresh;
  }
}

/**
 * Asks once about every capture still waiting (the card closed before it finished) and settles the
 * ones that are done. Runs in the widget's periodic update, inside the launcher's 30 s task limit:
 * `budgetMs` bounds the whole pass.
 */
export async function settlePendingCaptures(
  userId: string | undefined,
  budgetMs: number,
): Promise<void> {
  if (!userId) {
    return;
  }
  const deadline = Date.now() + budgetMs;
  const jobs = readPendingCaptureJobs()
    .filter((job) => job.userId === userId)
    .slice(0, MAX_JOBS_PER_PASS);
  for (const job of jobs) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return;
    }
    try {
      const outcome = outcomeOfJob(
        await fetchIngestJob(job.id, {
          timeout: Math.min(SETTLE_REQUEST_TIMEOUT_MS, remaining),
        }),
      );
      if (outcome) {
        await applyCaptureOutcome({ userId, jobId: job.id, outcome, awaitSnapshot: true });
      }
    } catch (error) {
      // 404 / 401: this job can never be read by this account again.
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 404 || status === 401) {
        removePendingCaptureJob(job.id);
      }
    }
  }
}
