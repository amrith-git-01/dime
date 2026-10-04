import { Hono } from 'hono';
import type { Context } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import { limitBody, limitUpload } from '../../core/body-limit';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { BadRequestError, PayloadTooLargeError, UnsupportedMediaTypeError } from '../../core/errors';
import { detectReceiptImageFormat } from '../../core/image-format';
import { rateLimit } from '../../core/rate-limit';
import { getSupabase } from '../../core/supabase';
import { unprocessable, validate } from '../../core/validation';
import { IDEMPOTENCY_KEY_HEADER, parseIdempotencyKey } from '../jobs/idempotency';
import { detectAudioFormat } from '../media/audio-format';
import { timezoneQuerySchema } from '../transactions/schemas';
import { smsBatchSchema } from './schemas';
import { acceptMedia, acceptSms, isReplay } from './service';
import type { IngestContext } from './service';

/**
 * Capture endpoints, mounted at `/transactions` next to the transaction router: receipt, voice and
 * SMS are accepted with 202 and processed by the queue consumer (`consumer.ts`).
 */
export const ingestRoutes = new Hono<AppBindings>();

ingestRoutes.use(requireAuth);

/** Bytes inspected for magic-byte sniffing. */
const SNIFF_BYTES = 32;
/** An SMS batch is at most 50 x 2000 chars; this leaves room for JSON escapes. */
const SMS_BODY_LIMIT_BYTES = 1024 * 1024;
const ACCEPTED = { accepted: true } as const;

function ingestContext(c: Context<AppBindings>): IngestContext {
  return {
    db: getSupabase(c),
    userId: currentUser(c).id,
    bucket: getConfig(c.env).privateStorageBucket,
    queue: c.env.INGEST_QUEUE,
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
      timezone: c.req.valid('query').timezone,
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
    const key = parseIdempotencyKey(c.req.header(IDEMPOTENCY_KEY_HEADER));
    const ctx = ingestContext(c);
    if (await isReplay(ctx.db, ctx.userId, key)) return c.json(ACCEPTED, 202);

    const file = await readFilePart(c, getConfig(c.env).maxVoiceUploadBytes);
    const detected = detectAudioFormat(await readHeader(file));
    // CAF is sniffed but Groq cannot decode it and there is no ffmpeg here: refuse it up front
    // instead of failing silently later (voice failures raise no notification).
    if (!detected || detected.ext === 'caf') throw new UnsupportedMediaTypeError('Unsupported audio type.');
    await acceptMedia(ctx, {
      kind: 'voice',
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: detected.contentType,
      extension: detected.ext,
      timezone: c.req.valid('query').timezone,
      key,
    });
    return c.json(ACCEPTED, 202);
  },
);

ingestRoutes.post(
  '/sms',
  rateLimit('WRITE_LIMITER'),
  rateLimit('AI_LIMITER'),
  limitBody(SMS_BODY_LIMIT_BYTES),
  validate('query', timezoneQuerySchema),
  validate('json', smsBatchSchema),
  async (c) => {
    const key = parseIdempotencyKey(c.req.header(IDEMPOTENCY_KEY_HEADER));
    const response = await acceptSms(ingestContext(c), {
      body: c.req.valid('json'),
      timezone: c.req.valid('query').timezone,
      key,
    });
    return c.json(response, 202);
  },
);
