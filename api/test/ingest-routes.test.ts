import { describe, expect, it } from 'vitest';

import type { Bindings } from '../src/core/env';
import { USER_ID, call, makeEnv } from './helpers';
import { CAF, FakeQueue, JPEG, KEY, M4A, TEXT, TZ, jobRow, uploadForm } from './ingest-fixtures';
import { json, pgError, rows, useSupabaseStub } from './supabase-stub';

const stub = useSupabaseStub();

/** Env with a recording queue and the rate limiters switched off (they are covered separately). */
function ingestEnv(queue: FakeQueue, extra: Record<string, string> = {}): Bindings {
  return { ...makeEnv(extra), INGEST_QUEUE: queue.asQueue(), WRITE_LIMITER: undefined, AI_LIMITER: undefined } as unknown as Bindings;
}

const storageOk = () => stub.on('POST', '/storage/v1/object/Dime-private', () => json({ Key: 'ok' }));
const jobInsert = (over: Record<string, unknown> = {}) => stub.on('POST', '/rest/v1/jobs', (c) => rows((c.body as unknown[]).map((b, i) => jobRow({ id: `job-${i}`, ...(b as object), ...over }))));
const jobsPosted = () => stub.last('POST', '/rest/v1/jobs').body as Record<string, unknown>[];

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
  it('uploads to the private bucket, inserts a pending job and queues only {job_id, kind}', async () => {
    storageOk();
    jobInsert();
    const queue = new FakeQueue();
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, { method: 'POST', body: uploadForm(JPEG, 'r.jpg', 'text/plain'), env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: true });

    const upload = stub.last('POST', '/storage/v1/object/Dime-private');
    // The stored content type is sniffed from the bytes, not taken from the client's text/plain.
    expect(upload.headers.get('content-type')).toBe('image/jpeg');
    expect(upload.path).toMatch(new RegExp(`/storage/v1/object/Dime-private/receipts/${USER_ID}/receipts/\\d{4}-\\d{2}-\\d{2}/\\d+-[0-9a-f]{8}\\.jpg`));
    expect((upload.body as ArrayBuffer).byteLength).toBe(JPEG.byteLength);

    const [job] = jobsPosted();
    expect(job).toMatchObject({ user_id: USER_ID, kind: 'receipt', status: 'pending', attempts: 0, idempotency_key: null });
    const payload = job?.['payload'] as Record<string, string>;
    expect(payload).toEqual({ object_path: expect.stringMatching(/^receipts\//) as string, mime_type: 'image/jpeg', timezone: 'Asia/Kolkata' });
    expect(upload.path).toContain(payload['object_path']);
    expect(queue.sent).toEqual([{ job_id: 'job-0', kind: 'receipt' }]);
  });

  it('replays a known Idempotency-Key before reading the body or uploading anything', async () => {
    stub.on('GET', '/rest/v1/jobs', () => rows([jobRow({ kind: 'receipt', idempotency_key: KEY })]));
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
    expect(stub.last('GET', '/rest/v1/jobs').params.get('idempotency_key')).toBe(`in.(${KEY})`);
    expect(stub.find('POST', '/storage/v1')).toHaveLength(0);
    expect(stub.find('POST', '/rest/v1/jobs')).toHaveLength(0);
    expect(queue.sent).toEqual([]);
  });

  it('stores the key on the job when it is new', async () => {
    stub.on('GET', '/rest/v1/jobs', () => rows([]));
    storageOk();
    jobInsert();
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, {
      method: 'POST',
      body: uploadForm(JPEG),
      headers: { 'Idempotency-Key': KEY },
      env: ingestEnv(new FakeQueue()),
    });
    expect(res.status).toBe(202);
    expect(jobsPosted()[0]).toMatchObject({ idempotency_key: KEY });
  });

  it('413 when the file exceeds the cap (Content-Length is unknown here, so the stream is counted)', async () => {
    storageOk();
    const big = new Uint8Array(300 * 1024).fill(1);
    big.set(JPEG);
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, {
      method: 'POST',
      body: uploadForm(big),
      env: ingestEnv(new FakeQueue(), { MAX_RECEIPT_UPLOAD_BYTES: '1000' }),
    });
    expect(res.status).toBe(413);
    expect(stub.calls).toHaveLength(0);
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
    expect(stub.calls).toHaveLength(0);
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
    expect(stub.calls).toHaveLength(0);
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

  it('a lost idempotency race (unique violation) is a 202 and the duplicate upload is removed', async () => {
    stub.on('GET', '/rest/v1/jobs', () => rows([]));
    storageOk();
    stub.on('DELETE', '/storage/v1/object/Dime-private', () => json([]));
    stub.on('POST', '/rest/v1/jobs', () => pgError('23505', 'duplicate key value violates unique constraint', 409));
    const queue = new FakeQueue();
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, {
      method: 'POST',
      body: uploadForm(JPEG),
      headers: { 'Idempotency-Key': KEY },
      env: ingestEnv(queue),
    });
    expect(res.status).toBe(202);
    const uploaded = stub.last('POST', '/storage/v1/object/Dime-private').path.split('/Dime-private/')[1];
    const removed = stub.last('DELETE', '/storage/v1/object/Dime-private').body as { prefixes: string[] };
    expect(removed.prefixes).toEqual([uploaded]);
    expect(queue.sent).toEqual([]);
  });

  it('any other insert failure removes the upload and propagates as a generic 500', async () => {
    storageOk();
    stub.on('DELETE', '/storage/v1/object/Dime-private', () => json([]));
    stub.on('POST', '/rest/v1/jobs', () => pgError('XX000', 'internal secret detail', 500));
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, { method: 'POST', body: uploadForm(JPEG), env: ingestEnv(new FakeQueue()) });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret');
    expect(stub.find('DELETE', '/storage/v1/object/Dime-private')).toHaveLength(1);
  });

  it('a failing queue send still returns 202: the job stays pending for the sweep', async () => {
    storageOk();
    jobInsert();
    const queue = new FakeQueue();
    queue.failWith = new Error('queue down');
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, { method: 'POST', body: uploadForm(JPEG), env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    expect(stub.find('POST', '/rest/v1/jobs')).toHaveLength(1);
    expect(stub.find('DELETE', '/storage/v1')).toHaveLength(0);
  });
});

describe('POST /transactions/voice', () => {
  it('queues a voice job for an m4a upload', async () => {
    storageOk();
    jobInsert();
    const queue = new FakeQueue();
    const res = await call(`/api/v1/transactions/voice?${TZ}`, { method: 'POST', body: uploadForm(M4A, 'v.m4a', 'audio/m4a'), env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: true });
    const upload = stub.last('POST', '/storage/v1/object/Dime-private');
    expect(upload.headers.get('content-type')).toBe('audio/mp4');
    expect(upload.path).toMatch(new RegExp(`voice_inputs/${USER_ID}/voice_inputs/.*\\.m4a`));
    expect(jobsPosted()[0]).toMatchObject({ kind: 'voice', payload: { mime_type: 'audio/mp4', timezone: 'Asia/Kolkata' } });
    expect(queue.sent).toEqual([{ job_id: 'job-0', kind: 'voice' }]);
  });

  it('415 for non-audio and for CAF (Groq cannot read it and there is no ffmpeg)', async () => {
    const env = ingestEnv(new FakeQueue());
    expect((await call(`/api/v1/transactions/voice?${TZ}`, { method: 'POST', body: uploadForm(TEXT), env })).status).toBe(415);
    const caf = await call(`/api/v1/transactions/voice?${TZ}`, { method: 'POST', body: uploadForm(CAF), env });
    expect(caf.status).toBe(415);
    expect(await caf.json()).toEqual({ detail: 'Unsupported audio type.' });
    expect(stub.calls).toHaveLength(0);
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

    stub.on('GET', '/rest/v1/jobs', () => rows([jobRow({ kind: 'voice', idempotency_key: KEY })]));
    const replay = await call(`/api/v1/transactions/voice?${TZ}`, {
      method: 'POST',
      body: uploadForm(M4A),
      headers: { 'Idempotency-Key': KEY },
      env: ingestEnv(new FakeQueue()),
    });
    expect(replay.status).toBe(202);
    expect(stub.find('POST', '/storage/v1')).toHaveLength(0);
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
    jobInsert();
    const queue = new FakeQueue();
    const res = await post([sms('a'), sms('b'), sms('a', '2026-10-04T10:00:00Z')], { env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    expect(await res.json<SmsBody>()).toEqual({
      accepted: true,
      results: [
        { index: 0, status: 'queued', job_id: 'job-0' },
        { index: 1, status: 'queued', job_id: 'job-1' },
        { index: 2, status: 'duplicate', duplicate_of: 0 },
      ],
    });
    const inserted = jobsPosted();
    expect(inserted).toHaveLength(2); // ONE insert statement for the whole batch
    expect(stub.find('POST', '/rest/v1/jobs')).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      user_id: USER_ID,
      kind: 'sms',
      status: 'pending',
      attempts: 0,
      idempotency_key: null,
      payload: { body: 'a', received_at: '2026-10-04T10:00:00.000Z', timezone: 'Asia/Kolkata' },
    });
    expect(queue.sent).toEqual([
      { job_id: 'job-0', kind: 'sms' },
      { job_id: 'job-1', kind: 'sms' },
    ]);
  });

  it('derives "<key>:<index>" per message using the ORIGINAL index (duplicates keep their slot)', async () => {
    stub.on('GET', '/rest/v1/jobs', () => rows([]));
    jobInsert();
    await post([sms('a'), sms('a'), sms('b')], { key: KEY });
    expect(jobsPosted().map((r) => r['idempotency_key'])).toEqual([`${KEY}:0`, `${KEY}:2`]);
    expect(stub.last('GET', '/rest/v1/jobs').params.get('idempotency_key')).toBe(`in.(${KEY}:0,${KEY}:2)`);
  });

  it('a replay rebuilds the batch result from the existing rows, creating nothing', async () => {
    stub.on('GET', '/rest/v1/jobs', () =>
      rows([
        jobRow({ id: 'j0', idempotency_key: `${KEY}:0` }),
        jobRow({ id: 'j2', idempotency_key: `${KEY}:2` }),
      ]),
    );
    const queue = new FakeQueue();
    const res = await post([sms('a'), sms('a'), sms('b')], { key: KEY, env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    expect(await res.json<SmsBody>()).toEqual({
      accepted: true,
      results: [
        { index: 0, status: 'queued', job_id: 'j0' },
        { index: 1, status: 'duplicate', duplicate_of: 0 },
        { index: 2, status: 'queued', job_id: 'j2' },
      ],
    });
    expect(stub.find('POST', '/rest/v1/jobs')).toHaveLength(0);
    expect(queue.sent).toEqual([]);
  });

  it('a unique violation on insert (concurrent identical request) falls back to the replay', async () => {
    let lookups = 0;
    stub.on('GET', '/rest/v1/jobs', () => rows(++lookups === 1 ? [] : [jobRow({ id: 'jx', idempotency_key: `${KEY}:0` })]));
    stub.on('POST', '/rest/v1/jobs', () => pgError('23505', 'duplicate key value', 409));
    const queue = new FakeQueue();
    const res = await post([sms('a')], { key: KEY, env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    expect((await res.json<SmsBody>()).results).toEqual([{ index: 0, status: 'queued', job_id: 'jx' }]);
    expect(queue.sent).toEqual([]);
  });

  it('all or nothing: a failed insert queues nothing and returns a generic 500', async () => {
    stub.on('POST', '/rest/v1/jobs', () => pgError('XX000', 'internal detail', 500));
    const queue = new FakeQueue();
    const res = await post([sms('a'), sms('b')], { env: ingestEnv(queue) });
    expect(res.status).toBe(500);
    expect(queue.sent).toEqual([]);
    expect(stub.find('POST', '/rest/v1/jobs')).toHaveLength(1);
  });

  it('a failing queue send leaves the inserted jobs pending and still answers 202', async () => {
    jobInsert();
    const queue = new FakeQueue();
    queue.failWith = new Error('queue down');
    const res = await post([sms('a'), sms('b')], { env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    expect((await res.json<SmsBody>()).results.map((r) => r.job_id)).toEqual(['job-0', 'job-1']);
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
  });

  it('accepts the body trimmed and a 50-message batch', async () => {
    jobInsert();
    const res = await post(Array.from({ length: 50 }, (_, i) => sms(`  msg ${i}  `)));
    expect(res.status).toBe(202);
    expect(jobsPosted()).toHaveLength(50);
    expect((jobsPosted()[0]?.['payload'] as { body: string }).body).toBe('msg 0');
  });
});
