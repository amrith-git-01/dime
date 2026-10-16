import { Hono } from 'hono';
import type { Context } from 'hono';
import { currentUser, requireAuth } from '../../core/auth';
import { limitUpload } from '../../core/body-limit';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { BadRequestError, NotFoundError, PayloadTooLargeError, UnsupportedMediaTypeError } from '../../core/errors';
import { detectReceiptImageFormat } from '../../core/image-format';
import { rateLimit } from '../../core/rate-limit';
import { parseTimezone } from '../../core/timezone';
import { getDb } from '../../core/db';
import { unprocessable, validate } from '../../core/validation';
import { IDEMPOTENCY_KEY_HEADER, parseIdempotencyKey } from '../jobs/idempotency';
import { getCaptureJobForUser } from '../jobs/repository';
import { detectAudioFormat } from '../media/audio-format';
import { mediaStore } from '../media/storage';
import { idParamSchema, timezoneQuerySchema } from '../transactions/schemas';
import { getTransaction } from '../transactions/service';
import { acceptMedia, findReplayJobId } from './service';
import type { IngestContext } from './service';

/**
 * Capture endpoints, mounted at `/transactions` next to the transaction router: receipt and voice
 * uploads are accepted with 202 and processed by the queue consumer (`consumer.ts`).
 */
export const ingestRoutes = new Hono<AppBindings>();

ingestRoutes.use(requireAuth);

/** Bytes inspected for magic-byte sniffing. */
const SNIFF_BYTES = 32;

function ingestContext(c: Context<AppBindings>): IngestContext {
  const { workersAi } = getConfig(c.env);
  return {
    db: getDb(c),
    storage: mediaStore(c.env),
    userId: currentUser(c).id,
    queue: c.env.INGEST_QUEUE,
    limits: { dailyNeuronCap: workersAi.dailyNeuronCap, userDailyReceipts: workersAi.userDailyReceipts, userDailyVoice: workersAi.userDailyVoice },
  };
}

/** 202 body: `job_id` is what the client polls on `GET /ingest/jobs/:id`. */
const accepted = (jobId: string | null) => ({ accepted: true, job_id: jobId }) as const;

/** FastAPI's response for a missing `file` form field. */
function missingFile(): never {
  return unprocessable([{ type: 'missing', loc: ['body', 'file'], msg: 'Field required' }]);
}

/** The `file` part of a multipart body, capped at `maxBytes` (413) and non-empty (400). */
async function readFilePart(c: Context<AppBindings>, maxBytes: number): Promise<File> {
  let form: FormData;
  try {
    form = await c.req.raw.formData();
  } catch {
    return missingFile();
  }
  const file = form.get('file');
  if (!(file instanceof File)) return missingFile();
  if (file.size > maxBytes) throw new PayloadTooLargeError(`File too large (max ${Math.floor(maxBytes / (1024 * 1024))} MB).`);
  if (file.size === 0) throw new BadRequestError('uploaded file is empty');
  return file;
}

async function readHeader(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
}

ingestRoutes.post(
  '/receipt',
  rateLimit('WRITE_LIMITER'),
  rateLimit('AI_LIMITER'),
  limitUpload((cfg) => cfg.maxReceiptUploadBytes),
  validate('query', timezoneQuerySchema),
  async (c) => {
    const timezone = parseTimezone(c.req.valid('query').timezone); // 400 before anything is read or stored
    const key = parseIdempotencyKey(c.req.header(IDEMPOTENCY_KEY_HEADER));
    const ctx = ingestContext(c);
    // C2: a known key is answered before the body is read or anything is uploaded.
    const replayJobId = await findReplayJobId(ctx.db, ctx.userId, key);
    if (replayJobId) return c.json(accepted(replayJobId), 202);

    const file = await readFilePart(c, getConfig(c.env).maxReceiptUploadBytes);
    const detected = detectReceiptImageFormat(await readHeader(file));
    if (!detected) throw new UnsupportedMediaTypeError('Unsupported image type (use JPEG, PNG, WebP, or HEIC).');
    const jobId = await acceptMedia(ctx, {
      kind: 'receipt',
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: detected.contentType,
      extension: detected.ext,
      timezone,
      key,
    });
    return c.json(accepted(jobId), 202);
  },
);

ingestRoutes.post(
  '/voice',
  rateLimit('WRITE_LIMITER'),
  rateLimit('AI_LIMITER'),
  limitUpload((cfg) => cfg.maxVoiceUploadBytes),
  validate('query', timezoneQuerySchema),
  async (c) => {
    const timezone = parseTimezone(c.req.valid('query').timezone); // 400 before anything is read or stored
    const key = parseIdempotencyKey(c.req.header(IDEMPOTENCY_KEY_HEADER));
    const ctx = ingestContext(c);
    const replayJobId = await findReplayJobId(ctx.db, ctx.userId, key);
    if (replayJobId) return c.json(accepted(replayJobId), 202);

    const file = await readFilePart(c, getConfig(c.env).maxVoiceUploadBytes);
    const detected = detectAudioFormat(await readHeader(file));
    // CAF is sniffed but Whisper cannot decode it and there is no ffmpeg here: refuse it up front
    // instead of failing silently later (voice failures raise no notification).
    if (!detected || detected.ext === 'caf') throw new UnsupportedMediaTypeError('Unsupported audio type.');
    const jobId = await acceptMedia(ctx, {
      kind: 'voice',
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: detected.contentType,
      extension: detected.ext,
      timezone,
      key,
    });
    return c.json(accepted(jobId), 202);
  },
);

/**
 * Mounted at `/ingest`: where a receipt / voice capture stands. `GET /jobs/:id` is user-scoped (another
 * user's job is a 404, and there is no limiter: a read must not eat the 60/min write budget) and tells the Android widget card, which polls after an upload, what was added.
 */
export const ingestJobRoutes = new Hono<AppBindings>();

ingestJobRoutes.use(requireAuth);

ingestJobRoutes.get('/jobs/:id', validate('param', idParamSchema), async (c) => {
  const userId = currentUser(c).id;
  const db = getDb(c);
  const job = await getCaptureJobForUser(db, userId, c.req.valid('param').id);
  if (!job) throw new NotFoundError('Job not found.');
  if (job.status !== 'done') return c.json({ status: job.status });

  // A done job names its transaction (a payment-hash duplicate names the existing one). It may have been deleted since.
  const transactionId = job.result?.['transaction_id'];
  if (typeof transactionId !== 'string') return c.json({ status: job.status });
  try {
    const config = getConfig(c.env);
    const tx = await getTransaction({ db, storage: mediaStore(c.env), userId, media: { expiresIn: config.signedUrlTtlSeconds } }, transactionId);
    return c.json({
      status: job.status,
      transaction: { id: tx.id, amount: tx.amount, type: tx.type, counterparty_name: tx.counterparty_name, category: tx.category },
    });
  } catch (err) {
    if (err instanceof NotFoundError) return c.json({ status: job.status });
    throw err;
  }
});
