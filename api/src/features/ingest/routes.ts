import { Hono } from 'hono';
import type { Context } from 'hono';
import { currentUser, requireAuth } from '../../core/auth';
import { limitUpload } from '../../core/body-limit';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { BadRequestError, PayloadTooLargeError, UnsupportedMediaTypeError } from '../../core/errors';
import { detectReceiptImageFormat } from '../../core/image-format';
import { rateLimit } from '../../core/rate-limit';
import { parseTimezone } from '../../core/timezone';
import { getDb } from '../../core/db';
import { unprocessable, validate } from '../../core/validation';
import { IDEMPOTENCY_KEY_HEADER, parseIdempotencyKey } from '../jobs/idempotency';
import { detectAudioFormat } from '../media/audio-format';
import { mediaStore } from '../media/storage';
import { timezoneQuerySchema } from '../transactions/schemas';
import { acceptMedia, isReplay } from './service';
import type { IngestContext } from './service';

/**
 * Capture endpoints, mounted at `/transactions` next to the transaction router: receipt and voice
 * uploads are accepted with 202 and processed by the queue consumer (`consumer.ts`).
 */
export const ingestRoutes = new Hono<AppBindings>();

ingestRoutes.use(requireAuth);

/** Bytes inspected for magic-byte sniffing. */
const SNIFF_BYTES = 32;
const ACCEPTED = { accepted: true } as const;

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
    if (await isReplay(ctx.db, ctx.userId, key)) return c.json(ACCEPTED, 202);

    const file = await readFilePart(c, getConfig(c.env).maxReceiptUploadBytes);
    const detected = detectReceiptImageFormat(await readHeader(file));
    if (!detected) throw new UnsupportedMediaTypeError('Unsupported image type (use JPEG, PNG, WebP, or HEIC).');
    await acceptMedia(ctx, {
      kind: 'receipt',
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: detected.contentType,
      extension: detected.ext,
      timezone,
      key,
    });
    return c.json(ACCEPTED, 202);
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
    if (await isReplay(ctx.db, ctx.userId, key)) return c.json(ACCEPTED, 202);

    const file = await readFilePart(c, getConfig(c.env).maxVoiceUploadBytes);
    const detected = detectAudioFormat(await readHeader(file));
    // CAF is sniffed but Whisper cannot decode it and there is no ffmpeg here: refuse it up front
    // instead of failing silently later (voice failures raise no notification).
    if (!detected || detected.ext === 'caf') throw new UnsupportedMediaTypeError('Unsupported audio type.');
    await acceptMedia(ctx, {
      kind: 'voice',
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: detected.contentType,
      extension: detected.ext,
      timezone,
      key,
    });
    return c.json(ACCEPTED, 202);
  },
);
