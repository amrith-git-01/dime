import type { SubmittedCapture } from "@/features/transactions/api/submitTransactionApi";

import {
  addedText,
  CAPTURE_FAILED_TEXT,
  READING_RECEIPT_TEXT,
  READING_VOICE_TEXT,
  STILL_READING_TEXT,
} from "./captureText";
import { pollIngestJob } from "./pollIngestJob";
import { applyCaptureOutcome, markCaptureFailed, markCaptureReading } from "./settleCapture";

/** Where the card's pill is: sending, waiting for the server to read it, or one of the three endings. */
export type CapturePhase = "uploading" | "reading" | "added" | "failed" | "timeout";

export type CaptureKind = "receipt" | "voice";

const UPLOADING_TEXT = "Uploading…";

/**
 * How a capture ended. `failure` says where a failed one broke: `submit` (the upload never got an
 * answer, so a retry must reuse the Idempotency-Key) or `job` (the server accepted it and the job
 * failed: the key now belongs to that failed job, so a retry needs a new key).
 */
export type CaptureResult = { phase: CapturePhase; failure?: "submit" | "job" };

type RunCaptureInput = {
  userId: string;
  kind: CaptureKind;
  /** Sends the file; throws an Error whose message is shown to the user (a limit message, offline). */
  submit: () => Promise<SubmittedCapture>;
  onPhase: (phase: CapturePhase, text: string) => void;
  /** The card closed: stop waiting (the pending job is settled by the widget later). */
  isCancelled?: () => boolean;
  poll?: typeof pollIngestJob;
};

/**
 * One capture from the card: upload, then poll the job every 2 s for up to 20 s. Reports each step
 * to `onPhase` for the pill, and keeps the widget's status line and pending list in step so it can
 * finish the job if the card is gone. Never throws. Returns the final phase and, for a failure, where it came from.
 */
export async function runCapture({
  userId,
  kind,
  submit,
  onPhase,
  isCancelled,
  poll = pollIngestJob,
}: RunCaptureInput): Promise<CaptureResult> {
  const end = (phase: CapturePhase, text: string, failure?: "submit" | "job"): CaptureResult => {
    onPhase(phase, text);
    return failure ? { phase, failure } : { phase };
  };

  onPhase("uploading", UPLOADING_TEXT);
  let jobId: string | null;
  try {
    ({ jobId } = await submit());
  } catch (error) {
    const text = error instanceof Error && error.message ? error.message : CAPTURE_FAILED_TEXT;
    markCaptureFailed({ userId, text });
    return end("failed", text, "submit");
  }
  if (!jobId) {
    // An older server accepted the file but names no job: nothing to wait for or track.
    return end("timeout", STILL_READING_TEXT);
  }

  markCaptureReading({
    userId,
    jobId,
    text: kind === "voice" ? READING_VOICE_TEXT : READING_RECEIPT_TEXT,
  });
  onPhase("reading", kind === "voice" ? READING_VOICE_TEXT : READING_RECEIPT_TEXT);

  const outcome = await poll(jobId, isCancelled ? { isCancelled } : {});
  await applyCaptureOutcome({ userId, jobId, outcome });
  switch (outcome.kind) {
    case "done": {
      const { transaction } = outcome;
      return end(
        "added",
        transaction
          ? addedText(
              transaction.amount,
              transaction.counterparty_name ?? transaction.category,
              transaction.type,
            )
          : "Added",
      );
    }
    case "failed":
      return end("failed", CAPTURE_FAILED_TEXT, "job");
    case "timeout":
      return end("timeout", STILL_READING_TEXT);
  }
}
