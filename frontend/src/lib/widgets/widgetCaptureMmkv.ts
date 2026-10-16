import { createMMKV } from "react-native-mmkv";

/**
 * What the widget's capture card last did (a receipt, photo or voice note sent for reading) and the
 * jobs still waiting for a result. The card writes it, the widget reads it for its status line, and
 * the headless task settles the pending jobs. User data: cleared on sign-out (`clearAppDataMmkv`).
 * Read in the headless widget task, so this module must stay free of React and navigation imports.
 */
const captureMmkv = createMMKV({ id: "widget-capture" });

const STATUS_KEY = "dime:widget-capture-status";
const PENDING_KEY = "dime:widget-capture-pending";

/** The widget's status line is shown for this long after the capture. */
export const WIDGET_CAPTURE_STATUS_TTL_MS = 10 * 60_000;
/** A job nobody saw finish is dropped after this long (the server's own sweep gave up on it by then). */
const PENDING_JOB_MAX_AGE_MS = 30 * 60_000;
const MAX_PENDING_JOBS = 10;

export type WidgetCaptureStatus = {
  kind: "reading" | "added" | "failed";
  /** The line shown on the widget: "Reading receipt…", "Added ₹250 · Swiggy". */
  text: string;
  /** Epoch ms this status was set. */
  at: number;
  /** The account this is about; another account's status is never shown. */
  userId: string;
  /** The job a "reading" status is waiting for. */
  jobId?: string;
};

/** A capture the server accepted but had not finished when the card closed. */
export type WidgetPendingJob = {
  id: string;
  userId: string;
  /** Epoch ms of the upload. */
  at: number;
};

function readJson<T>(key: string): T | null {
  const raw = captureMmkv.getString(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readWidgetCaptureStatus(): WidgetCaptureStatus | null {
  return readJson<WidgetCaptureStatus>(STATUS_KEY);
}

export function writeWidgetCaptureStatus(status: WidgetCaptureStatus | null): void {
  if (!status) {
    captureMmkv.remove(STATUS_KEY);
    return;
  }
  captureMmkv.set(STATUS_KEY, JSON.stringify(status));
}

/** The status to show for `userId` right now, or null once it is stale or belongs to someone else. */
export function currentWidgetCaptureStatus(
  userId: string | undefined,
  now: number = Date.now(),
): WidgetCaptureStatus | null {
  const status = readWidgetCaptureStatus();
  if (
    !status ||
    !userId ||
    status.userId !== userId ||
    now - status.at > WIDGET_CAPTURE_STATUS_TTL_MS
  ) {
    return null;
  }
  return status;
}

export function readPendingCaptureJobs(now: number = Date.now()): WidgetPendingJob[] {
  const jobs = readJson<WidgetPendingJob[]>(PENDING_KEY);
  return Array.isArray(jobs)
    ? jobs.filter((job) => now - job.at <= PENDING_JOB_MAX_AGE_MS)
    : [];
}

function writePendingCaptureJobs(jobs: WidgetPendingJob[]): void {
  if (jobs.length === 0) {
    captureMmkv.remove(PENDING_KEY);
    return;
  }
  captureMmkv.set(PENDING_KEY, JSON.stringify(jobs.slice(-MAX_PENDING_JOBS)));
}

export function addPendingCaptureJob(job: WidgetPendingJob): void {
  writePendingCaptureJobs([
    ...readPendingCaptureJobs().filter((existing) => existing.id !== job.id),
    job,
  ]);
}

export function removePendingCaptureJob(jobId: string): void {
  writePendingCaptureJobs(readPendingCaptureJobs().filter((job) => job.id !== jobId));
}

/** Sign-out: the status line and the waiting jobs belong to the previous user. */
export function clearWidgetCaptureData(): void {
  captureMmkv.remove(STATUS_KEY);
  captureMmkv.remove(PENDING_KEY);
}
