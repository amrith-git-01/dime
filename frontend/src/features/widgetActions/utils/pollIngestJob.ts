import { isAxiosError } from "axios";

import {
  fetchIngestJob,
  type IngestJob,
  type IngestJobTransaction,
} from "../api/ingestJobApi";

/** How a capture ended, as far as the card can tell. */
export type CaptureOutcome =
  | { kind: "done"; transaction: IngestJobTransaction | null }
  | { kind: "failed" }
  /** Still reading when the polling time ran out; the widget settles it later. */
  | { kind: "timeout" };

export const POLL_INTERVAL_MS = 2_000;
export const POLL_TIMEOUT_MS = 20_000;
/** One request must not eat the whole budget on a bad connection. */
const POLL_REQUEST_TIMEOUT_MS = 8_000;

/** The outcome for a job that has finished; null while it is still pending or processing. */
export function outcomeOfJob(job: IngestJob): Exclude<CaptureOutcome, { kind: "timeout" }> | null {
  if (job.status === "done") {
    return { kind: "done", transaction: job.transaction ?? null };
  }
  if (job.status === "failed") {
    return { kind: "failed" };
  }
  return null;
}

/** 401 (signed out) and 404 (not this user's job) will never get better. */
function isFinalRequestError(error: unknown): boolean {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  return status === 401 || status === 404;
}

type PollOptions = {
  intervalMs?: number;
  timeoutMs?: number;
  /** Stops polling early (the card closed); resolves as a timeout. */
  isCancelled?: () => boolean;
  fetchJob?: (jobId: string) => Promise<IngestJob>;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Polls the job every `intervalMs` until it is done or failed, or `timeoutMs` has passed. A request
 * that fails for a passing reason (offline, 5xx, timeout) is simply tried again at the next tick.
 */
export async function pollIngestJob(
  jobId: string,
  {
    intervalMs = POLL_INTERVAL_MS,
    timeoutMs = POLL_TIMEOUT_MS,
    isCancelled = () => false,
    fetchJob = (id) => fetchIngestJob(id, { timeout: POLL_REQUEST_TIMEOUT_MS }),
    wait = sleep,
    now = Date.now,
  }: PollOptions = {},
): Promise<CaptureOutcome> {
  const deadline = now() + timeoutMs;
  for (;;) {
    if (isCancelled()) {
      return { kind: "timeout" };
    }
    try {
      const outcome = outcomeOfJob(await fetchJob(jobId));
      if (outcome) {
        return outcome;
      }
    } catch (error) {
      if (isFinalRequestError(error)) {
        return { kind: "failed" };
      }
    }
    if (now() + intervalMs > deadline) {
      return { kind: "timeout" };
    }
    await wait(intervalMs);
  }
}
