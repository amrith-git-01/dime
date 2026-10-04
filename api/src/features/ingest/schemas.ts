import * as z from 'zod';

import { datetimeInput } from '../transactions/schemas';

export const INGEST_KINDS = ['receipt', 'voice', 'sms'] as const;

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
});

/** `jobs.payload` of sms jobs. */
export const smsPayloadSchema = z.object({
  body: z.string().min(1),
  received_at: z.string().min(1),
  timezone: z.string().min(1),
});

/** One SMS of a batch: body trimmed (1-2000 chars, not blank), `received_at` any datetime the app sends. */
const smsItemSchema = z.object({
  body: z
    .string()
    .min(1)
    .max(2000)
    .transform((value, ctx): string => {
      const stripped = value.trim();
      if (!stripped) {
        ctx.addIssue({ code: 'custom', message: 'body must not be blank' });
        return z.NEVER;
      }
      return stripped;
    }),
  received_at: datetimeInput,
});

export const smsBatchSchema = z.object({
  messages: z.array(smsItemSchema).min(1).max(50),
});
export type SmsBatchBody = z.output<typeof smsBatchSchema>;

export interface SmsOutcome {
  index: number;
  status: 'queued' | 'duplicate';
  duplicate_of?: number;
  job_id?: string;
}
