import * as z from 'zod';

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
});
