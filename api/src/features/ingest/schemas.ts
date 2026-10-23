import * as z from 'zod';

import { BadRequestError } from '../../core/errors';
import { datetimeInput, timezoneQuerySchema } from '../transactions/schemas';
import type { Instant } from '../transactions/schemas';

export const INGEST_KINDS = ['receipt', 'voice'] as const;

/** A job claim is attempted at most this often (contract: Jobs lifecycle). */
export const MAX_JOB_ATTEMPTS = 3;

/** Queue message body: ids only, never media bytes or payloads. */
export const ingestMessageSchema = z.object({
  job_id: z.string().min(1),
  kind: z.enum(INGEST_KINDS),
});
export type IngestMessage = z.infer<typeof ingestMessageSchema>;

/** `jobs.payload` of receipt / voice jobs. */
export const mediaPayloadSchema = z.object({
  object_path: z.string().min(1),
  mime_type: z.string().min(1),
  timezone: z.string().min(1),
  /** ISO instant the user captured it (offline queue); optional so jobs queued before it existed still parse. */
  captured_at: z.string().min(1).optional(),
});

/** `?timezone=…&captured_at=…` of the receipt / voice uploads. */
export const captureQuerySchema = timezoneQuerySchema.extend({ captured_at: datetimeInput.optional() });

/** A capture may be stamped this far ahead of the server clock (device clock skew)... */
export const CAPTURED_AT_FUTURE_SLACK_MS = 5 * 60_000;
/** ...and queued offline for at most this long (the idempotency window, `MANUAL_CREATE_RETENTION_DAYS`). */
export const CAPTURED_AT_MAX_AGE_MS = 30 * 86_400_000;

/** The capture instant: the request time when the client sent none, a 400 when it is in the future or too old. */
export function resolveCapturedAt(raw: Instant | undefined, nowMs: number): Instant {
  if (!raw) return { ms: nowMs, iso: new Date(nowMs).toISOString() };
  if (raw.ms > nowMs + CAPTURED_AT_FUTURE_SLACK_MS) throw new BadRequestError('captured_at cannot be in the future.', 'captured_at_future');
  if (raw.ms < nowMs - CAPTURED_AT_MAX_AGE_MS) throw new BadRequestError('captured_at is too old (max 30 days).', 'captured_at_too_old');
  return raw;
}
