import { env as workerEnv } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { Bindings } from '../src/core/env';
import { USER_ID, call, makeEnv } from './helpers';
import { failingDb, failingOn, rowsOf, seedJob } from './db';
import { CAF, FakeQueue, JPEG, KEY, M4A, TEXT, TZ, uploadForm } from './ingest-fixtures';
import { useSupabaseStub } from './supabase-stub';

// Jobs live in D1 and media in R2 (both real, local); the stub only guards against stray outbound HTTP.
const stub = useSupabaseStub();

/** Env with a recording queue and the rate limiters switched off (they are covered separately). */
function ingestEnv(queue: FakeQueue, extra: Record<string, string> = {}): Bindings {
  return { ...makeEnv(extra), INGEST_QUEUE: queue.asQueue(), WRITE_LIMITER: undefined, AI_LIMITER: undefined } as unknown as Bindings;
}

/** Keys currently in the R2 bucket. */
const storedKeys = async () => (await workerEnv.MEDIA.list()).objects.map((o) => o.key);

interface JobRecord {
  id: string;
  user_id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  idempotency_key: string | null;
}

/** Stored jobs in insertion order, with the JSON payload parsed. */
async function jobs(): Promise<JobRecord[]> {
  return (await rowsOf<Omit<JobRecord, 'payload'> & { payload: string }>('jobs')).map((j) => ({ ...j, payload: JSON.parse(j.payload) as Record<string, unknown> }));
}

const sms = (body: string, at = '2026-10-04T10:00:00+00:00') => ({ body, received_at: at });

describe('auth and validation', () => {
  it('401 without a token', async () => {
    for (const path of ['receipt', 'voice', 'sms']) {
      expect((await call(`/api/v1/transactions/${path}?${TZ}`, { method: 'POST', token: false })).status, path).toBe(401);
    }
    expect(stub.calls).toHaveLength(0);
  });

  it('422 when timezone is missing; the body is never read', async () => {
    const res = await call('/api/v1/transactions/receipt', { method: 'POST', body: uploadForm(JPEG), env: ingestEnv(new FakeQueue()) });
    expect(res.status).toBe(422);
    expect(stub.calls).toHaveLength(0);
  });

  it('422 for a malformed Idempotency-Key', async () => {
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, {
      method: 'POST',
      body: uploadForm(JPEG),
      headers: { 'Idempotency-Key': 'short' },
      env: ingestEnv(new FakeQueue()),
    });
    expect(res.status).toBe(422);
  });

  it('429 when a rate limiter rejects', async () => {
    const limiter = { limit: () => Promise.resolve({ success: false }) };
    const env = { ...ingestEnv(new FakeQueue()), AI_LIMITER: limiter } as unknown as Bindings;
    const res = await call(`/api/v1/transactions/sms?${TZ}`, { method: 'POST', json: { messages: [sms('a')] }, env });
    expect(res.status).toBe(429);
  });
});

describe('POST /transactions/receipt', () => {
  it('uploads to R2, inserts a pending job and queues only {job_id, kind}', async () => {
    const queue = new FakeQueue();
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, { method: 'POST', body: uploadForm(JPEG, 'r.jpg', 'text/plain'), env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: true });

    const [key] = await storedKeys();
    const upload = await workerEnv.MEDIA.get(key ?? '');
    // The stored content type is sniffed from the bytes, not taken from the client's text/plain.
    expect(upload?.httpMetadata?.contentType).toBe('image/jpeg');
    expect(key).toMatch(new RegExp(`^receipts/${USER_ID}/receipts/\\d{4}-\\d{2}-\\d{2}/\\d+-[0-9a-f]{8}\\.jpg$`));
    expect(upload?.size).toBe(JPEG.byteLength);

    const [job] = await jobs();
    expect(job).toMatchObject({ user_id: USER_ID, kind: 'receipt', status: 'pending', attempts: 0, idempotency_key: null });
    const payload = job?.payload as Record<string, string>;
    expect(payload).toEqual({ object_path: expect.stringMatching(/^receipts\//) as string, mime_type: 'image/jpeg', timezone: 'Asia/Kolkata' });
    expect(key).toBe(payload['object_path']);
    expect(queue.sent).toEqual([{ job_id: job?.id, kind: 'receipt' }]);
  });

  it('replays a known Idempotency-Key before reading the body or uploading anything', async () => {
    await seedJob({ kind: 'receipt', idempotency_key: KEY });
    const queue = new FakeQueue();
    // Not even a valid multipart body: if the handler read it the request would be a 422/415.
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, {
      method: 'POST',
      body: 'garbage',
      headers: { 'Idempotency-Key': KEY, 'content-type': 'text/plain' },
      env: ingestEnv(queue),
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: true });
    expect(await storedKeys()).toEqual([]);
    expect(await jobs()).toHaveLength(1);
    expect(queue.sent).toEqual([]);
  });

  it('stores the key on the job when it is new', async () => {
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, {
      method: 'POST',
      body: uploadForm(JPEG),
      headers: { 'Idempotency-Key': KEY },
      env: ingestEnv(new FakeQueue()),
    });
    expect(res.status).toBe(202);
    expect((await jobs())[0]).toMatchObject({ idempotency_key: KEY });
  });

  it('413 when the file exceeds the cap (Content-Length is unknown here, so the stream is counted)', async () => {
    const big = new Uint8Array(300 * 1024).fill(1);
    big.set(JPEG);
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, {
      method: 'POST',
      body: uploadForm(big),
      env: ingestEnv(new FakeQueue(), { MAX_RECEIPT_UPLOAD_BYTES: '1000' }),
    });
    expect(res.status).toBe(413);
    expect(await storedKeys()).toEqual([]);
  });

  it('413 for a file over the cap that still fits the multipart envelope', async () => {
    const big = new Uint8Array(5000).fill(1);
    big.set(JPEG);
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, {
      method: 'POST',
      body: uploadForm(big),
      env: ingestEnv(new FakeQueue(), { MAX_RECEIPT_UPLOAD_BYTES: '1000' }),
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ detail: 'File too large (max 0 MB).' });
    expect(await storedKeys()).toEqual([]);
  });

  it('413 on a declared Content-Length above the cap, before reading', async () => {
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': String(11 * 1024 * 1024), 'content-type': 'multipart/form-data; boundary=x' },
      env: ingestEnv(new FakeQueue()),
    });
    expect(res.status).toBe(413);
  });

  it('415 for anything that is not jpeg/png/webp/heic, without touching storage', async () => {
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, {
      method: 'POST',
      body: uploadForm(TEXT, 'r.jpg', 'image/jpeg'),
      env: ingestEnv(new FakeQueue()),
    });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ detail: 'Unsupported image type (use JPEG, PNG, WebP, or HEIC).' });
    expect(await storedKeys()).toEqual([]);
  });

  it('400 for an empty file and 422 for a missing file part', async () => {
    const env = ingestEnv(new FakeQueue());
    const empty = await call(`/api/v1/transactions/receipt?${TZ}`, { method: 'POST', body: uploadForm(new Uint8Array(0)), env });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ detail: 'uploaded file is empty' });

    const form = new FormData();
    form.append('other', 'x');
    const missing = await call(`/api/v1/transactions/receipt?${TZ}`, { method: 'POST', body: form, env });
    expect(missing.status).toBe(422);
    expect(await missing.json()).toEqual({ detail: [{ type: 'missing', loc: ['body', 'file'], msg: 'Field required' }] });

    const notMultipart = await call(`/api/v1/transactions/receipt?${TZ}`, { method: 'POST', json: { a: 1 }, env });
    expect(notMultipart.status).toBe(422);
  });

  it('a lost idempotency race (unique violation) is a 202; only one job is queued and the duplicate upload is removed', async () => {
    const queue = new FakeQueue();
    const send = () =>
      call(`/api/v1/transactions/receipt?${TZ}`, { method: 'POST', body: uploadForm(JPEG), headers: { 'Idempotency-Key': KEY }, env: ingestEnv(queue) });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status]).toEqual([202, 202]);
    expect(await jobs()).toHaveLength(1);
    expect(queue.sent).toHaveLength(1);
    // Whichever request lost the race (at the replay check or at the insert) leaves exactly one stored object behind.
    expect(await storedKeys()).toEqual([(await jobs())[0]?.payload['object_path']]);
  });

  it('any other insert failure removes the upload and propagates as a generic 500', async () => {
    const env = { ...ingestEnv(new FakeQueue()), DB: failingOn(/INSERT INTO jobs/, 'D1_ERROR: internal secret detail') } as unknown as Bindings;
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, { method: 'POST', body: uploadForm(JPEG), env });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
    expect(await storedKeys()).toEqual([]);
    expect(await jobs()).toHaveLength(0);
  });

  it('a failing queue send still returns 202: the job stays pending for the sweep', async () => {
    const queue = new FakeQueue();
    queue.failWith = new Error('queue down');
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, { method: 'POST', body: uploadForm(JPEG), env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    expect(await jobs()).toEqual([expect.objectContaining({ status: 'pending' })]);
    expect(await storedKeys()).toHaveLength(1);
  });
});

describe('POST /transactions/voice', () => {
  it('queues a voice job for an m4a upload', async () => {
    const queue = new FakeQueue();
    const res = await call(`/api/v1/transactions/voice?${TZ}`, { method: 'POST', body: uploadForm(M4A, 'v.m4a', 'audio/m4a'), env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: true });
    const [key] = await storedKeys();
    expect((await workerEnv.MEDIA.head(key ?? ''))?.httpMetadata?.contentType).toBe('audio/mp4');
    expect(key).toMatch(new RegExp(`^voice_inputs/${USER_ID}/voice_inputs/.*\\.m4a$`));
    const [job] = await jobs();
    expect(job).toMatchObject({ kind: 'voice', payload: { mime_type: 'audio/mp4', timezone: 'Asia/Kolkata' } });
    expect(queue.sent).toEqual([{ job_id: job?.id, kind: 'voice' }]);
  });

  it('415 for non-audio and for CAF (Whisper cannot read it and there is no ffmpeg)', async () => {
    const env = ingestEnv(new FakeQueue());
    expect((await call(`/api/v1/transactions/voice?${TZ}`, { method: 'POST', body: uploadForm(TEXT), env })).status).toBe(415);
    const caf = await call(`/api/v1/transactions/voice?${TZ}`, { method: 'POST', body: uploadForm(CAF), env });
    expect(caf.status).toBe(415);
    expect(await caf.json()).toEqual({ detail: 'Unsupported audio type.' });
    expect(await storedKeys()).toEqual([]);
  });

  it('uses the voice cap (413 above MAX_VOICE_UPLOAD_BYTES) and replays by key', async () => {
    const big = new Uint8Array(5000).fill(1);
    big.set(M4A);
    const tooBig = await call(`/api/v1/transactions/voice?${TZ}`, {
      method: 'POST',
      body: uploadForm(big),
      env: ingestEnv(new FakeQueue(), { MAX_VOICE_UPLOAD_BYTES: '1000' }),
    });
    expect(tooBig.status).toBe(413);

    await seedJob({ kind: 'voice', idempotency_key: KEY });
    const replay = await call(`/api/v1/transactions/voice?${TZ}`, {
      method: 'POST',
      body: uploadForm(M4A),
      headers: { 'Idempotency-Key': KEY },
      env: ingestEnv(new FakeQueue()),
    });
    expect(replay.status).toBe(202);
    expect(await storedKeys()).toEqual([]);
  });
});

describe('POST /transactions/sms', () => {
  const post = (messages: unknown[], opts: { key?: string; env?: Bindings; query?: string } = {}) =>
    call(`/api/v1/transactions/sms?${opts.query ?? TZ}`, {
      method: 'POST',
      json: { messages },
      headers: opts.key ? { 'Idempotency-Key': opts.key } : {},
      env: opts.env ?? ingestEnv(new FakeQueue()),
    });

  interface SmsBody {
    accepted: boolean;
    results: { index: number; status: string; duplicate_of?: number; job_id?: string }[];
  }

  it('queues each message with per-item results; in-batch duplicates are reported, not queued', async () => {
    const queue = new FakeQueue();
    const res = await post([sms('a'), sms('b'), sms('a', '2026-10-04T10:00:00Z')], { env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    const stored = await jobs();
    expect(stored).toHaveLength(2);
    expect(await res.json<SmsBody>()).toEqual({
      accepted: true,
      results: [
        { index: 0, status: 'queued', job_id: stored[0]?.id },
        { index: 1, status: 'queued', job_id: stored[1]?.id },
        { index: 2, status: 'duplicate', duplicate_of: 0 },
      ],
    });
    expect(stored[0]).toMatchObject({
      user_id: USER_ID,
      kind: 'sms',
      status: 'pending',
      attempts: 0,
      idempotency_key: null,
      payload: { body: 'a', received_at: '2026-10-04T10:00:00.000Z', timezone: 'Asia/Kolkata' },
    });
    expect(queue.sent).toEqual([
      { job_id: stored[0]?.id, kind: 'sms' },
      { job_id: stored[1]?.id, kind: 'sms' },
    ]);
  });

  it('derives "<key>:<index>" per message using the ORIGINAL index (duplicates keep their slot)', async () => {
    await post([sms('a'), sms('a'), sms('b')], { key: KEY });
    expect((await jobs()).map((r) => r.idempotency_key)).toEqual([`${KEY}:0`, `${KEY}:2`]);
  });

  it('a replay rebuilds the batch result from the existing rows, creating nothing', async () => {
    const j0 = await seedJob({ kind: 'sms', idempotency_key: `${KEY}:0` });
    const j2 = await seedJob({ kind: 'sms', idempotency_key: `${KEY}:2` });
    const queue = new FakeQueue();
    const res = await post([sms('a'), sms('a'), sms('b')], { key: KEY, env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    expect(await res.json<SmsBody>()).toEqual({
      accepted: true,
      results: [
        { index: 0, status: 'queued', job_id: j0 },
        { index: 1, status: 'duplicate', duplicate_of: 0 },
        { index: 2, status: 'queued', job_id: j2 },
      ],
    });
    expect(await jobs()).toHaveLength(2);
    expect(queue.sent).toEqual([]);
  });

  it('a concurrent identical request resolves to the same jobs: one set of rows, queued once', async () => {
    const queue = new FakeQueue();
    const [a, b] = await Promise.all([post([sms('a')], { key: KEY, env: ingestEnv(queue) }), post([sms('a')], { key: KEY, env: ingestEnv(queue) })]);
    expect([a.status, b.status]).toEqual([202, 202]);
    const stored = await jobs();
    expect(stored).toHaveLength(1);
    expect((await a.json<SmsBody>()).results).toEqual([{ index: 0, status: 'queued', job_id: stored[0]?.id }]);
    expect((await b.json<SmsBody>()).results).toEqual([{ index: 0, status: 'queued', job_id: stored[0]?.id }]);
    expect(queue.sent).toHaveLength(1);
  });

  it('all or nothing: a failed insert queues nothing and returns a generic 500', async () => {
    const queue = new FakeQueue();
    const res = await post([sms('a'), sms('b')], { env: { ...ingestEnv(queue), DB: failingDb('batch', 'D1_ERROR: internal detail') } as unknown as Bindings });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('detail":"D1');
    expect(queue.sent).toEqual([]);
    expect(await jobs()).toHaveLength(0);
  });

  it('a failing queue send leaves the inserted jobs pending and still answers 202', async () => {
    const queue = new FakeQueue();
    queue.failWith = new Error('queue down');
    const res = await post([sms('a'), sms('b')], { env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    const stored = await jobs();
    expect((await res.json<SmsBody>()).results.map((r) => r.job_id)).toEqual(stored.map((j) => j.id));
    expect(stored.map((j) => j.status)).toEqual(['pending', 'pending']);
  });

  it('validates the batch: blank body, empty list, too many, bad date, bad timezone, bad key', async () => {
    const blank = await post([sms('ok'), sms('   ')]);
    expect(blank.status).toBe(422);
    expect(await blank.json()).toEqual({
      detail: [{ type: 'value_error', loc: ['body', 'messages', 1, 'body'], msg: 'Value error, body must not be blank' }],
    });
    expect((await post([])).status).toBe(422);
    expect((await post(Array.from({ length: 51 }, (_, i) => sms(`m${i}`)))).status).toBe(422);
    expect((await post([{ body: 'x', received_at: 'yesterday' }])).status).toBe(422);
    expect((await post([sms('x')], { query: '' })).status).toBe(422);
    expect((await post([sms('x')], { key: 'bad' })).status).toBe(422);
    expect((await post([sms('x'.repeat(2001))])).status).toBe(422);
    expect(stub.calls).toHaveLength(0);
    expect(await jobs()).toHaveLength(0);
  });

  it('accepts the body trimmed and a 50-message batch', async () => {
    const res = await post(Array.from({ length: 50 }, (_, i) => sms(`  msg ${i}  `)));
    expect(res.status).toBe(202);
    const stored = await jobs();
    expect(stored).toHaveLength(50);
    expect(stored[0]?.payload['body']).toBe('msg 0');
  });
});
