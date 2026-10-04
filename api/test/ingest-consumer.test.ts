import { describe, expect, it } from 'vitest';

import { getConfig } from '../src/core/env';
import type { Bindings } from '../src/core/env';
import { createServiceClient } from '../src/core/supabase';
import { TransientAiError } from '../src/features/ai/errors';
import { handleIngestBatch, handleIngestDlq, isTransientError, processIngestMessage } from '../src/features/ingest/consumer';
import type { IngestDeps } from '../src/features/ingest/consumer';
import { InvalidJobError } from '../src/features/ingest/pipeline';
import { sweepJobs } from '../src/features/ingest/sweep';
import worker from '../src/index';
import { UpstreamError } from '../src/core/errors';
import { USER_ID, makeEnv } from './helpers';
import { CAT_FOOD, FakeMessage, FakeQueue, JOB, JPEG, M4A, TX, completion, fakeBatch, jobRow, mediaPayload, parsedSms, smsPayload } from './ingest-fixtures';
import { json, pgError, rows, useSupabaseStub } from './supabase-stub';
import type { RecordedCall } from './supabase-stub';

const stub = useSupabaseStub();

const env = (): Bindings => makeEnv({ DEEPSEEK_API_KEY: 'ds-key', GROQ_API_KEY: 'groq-key' });
const deps = (over: Partial<IngestDeps> = {}): IngestDeps => ({ db: createServiceClient(env()), config: getConfig(env()), ...over });
const msg = (attempts = 1) => new FakeMessage({ job_id: JOB, kind: 'sms' }, attempts);

const category = { id: CAT_FOOD, name: 'Food', icon_name: 'Utensils', color: '#111111', is_system: true };
const settings = {};

/** GET job -> `row`; the claim PATCH (status processing) returns it claimed, other PATCHes echo it. */
function stubJob(row: ReturnType<typeof jobRow>, opts: { claimLost?: boolean } = {}) {
  stub.on('GET', '/rest/v1/jobs', () => rows([row]));
  stub.on('PATCH', '/rest/v1/jobs', (c) => {
    const body = c.body as { status: string };
    if (body.status === 'processing') return rows(opts.claimLost ? [] : [{ ...row, status: 'processing', attempts: row.attempts + 1 }]);
    return rows([row]);
  });
}

/** Everything `createTransaction` + the success notification touch. */
function stubCapture() {
  stub.on('GET', '/rest/v1/categories', () => rows([category]));
  stub.on('GET', '/rest/v1/transactions', () => rows([]));
  stub.on('POST', '/rest/v1/transactions', () => rows([{ id: TX }]));
  stub.on('GET', '/rest/v1/user_settings', () => rows([settings]));
  stub.on('POST', '/rest/v1/notifications', (c) => rows([{ id: 'n1', ...(c.body as object) }]));
  stub.on('GET', '/rest/v1/push_tokens', () => rows([]));
}

const stubDeepSeek = (content: string) =>
  stub.on('POST', '/chat/completions', (c) => (c.url.host === 'api.deepseek.com' ? json(completion(content)) : json(completion('OCR TEXT SWIGGY 250.50'))));

const jobPatches = () => stub.find('PATCH', '/rest/v1/jobs').map((c) => c.body as Record<string, unknown>);
const notificationPosts = () => stub.find('POST', '/rest/v1/notifications').map((c: RecordedCall) => c.body as Record<string, unknown>);
const insertedTx = () => stub.last('POST', '/rest/v1/transactions').body as Record<string, unknown>;

describe('processIngestMessage: sms success', () => {
  it('claims, parses, creates the transaction with server-set fields, notifies and marks done', async () => {
    stubJob(jobRow({ payload: smsPayload({ body: 'INR 1,500 credited by ACME' }) }));
    stubCapture();
    stubDeepSeek(parsedSms({ type: 'credit', amount: 1500, counterparty_name: 'ACME', date: null, category: 'Food' }));
    const m = msg();
    await processIngestMessage(m, deps());

    expect(m.acked).toBe(true);
    expect(m.retried).toBeUndefined();

    // Claim: conditional pending -> processing with attempts + 1.
    const claim = stub.find('PATCH', '/rest/v1/jobs')[0];
    expect(claim?.body).toMatchObject({ status: 'processing', attempts: 1 });
    expect(claim?.params.get('status')).toBe('eq.pending');

    expect(insertedTx()).toMatchObject({
      user_id: USER_ID,
      amount: '1500.00',
      type: 'credit',
      detected_via: 'sms',
      receipt_url: null,
      voice_url: null,
      counterparty_name: 'ACME',
      category_id: CAT_FOOD,
      // No date from the model: the SMS receive time is used.
      transaction_at: '2026-10-04T10:00:00.000Z',
    });

    const done = jobPatches().at(-1);
    expect(done).toMatchObject({ status: 'done', result: { transaction_id: TX } });

    expect(notificationPosts()).toEqual([
      expect.objectContaining({ kind: 'transaction_auto', dedupe_key: `transaction_auto:${TX}`, title: '₹1,500 added', body: 'ACME · Food', action_transaction_id: TX }),
    ]);
  });

  it('a debit still completes when the follow-up notifications fail', async () => {
    stubJob(jobRow());
    stub.on('GET', '/rest/v1/categories', () => rows([category]));
    stub.on('GET', '/rest/v1/transactions', () => rows([]));
    stub.on('POST', '/rest/v1/transactions', () => rows([{ id: TX }]));
    stub.on('GET', '/rest/v1/user_settings', () => pgError('XX000', 'settings unavailable', 500));
    stubDeepSeek(parsedSms());
    const m = msg();
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(jobPatches().at(-1)).toMatchObject({ status: 'done', result: { transaction_id: TX } });
  });

  it('a duplicate payment is merged and reported as the existing transaction (no notification)', async () => {
    stubJob(jobRow());
    stub.on('GET', '/rest/v1/categories', () => rows([category]));
    stub.on('GET', '/rest/v1/transactions', () =>
      rows([{ id: 'existing-tx', user_id: USER_ID, category_id: CAT_FOOD, note: 'kept', receipt_url: null, voice_url: null, counterparty_type: 'merchant' }]),
    );
    stubDeepSeek(parsedSms());
    const m = msg();
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(stub.find('POST', '/rest/v1/transactions')).toHaveLength(0);
    expect(jobPatches().at(-1)).toMatchObject({ status: 'done', result: { transaction_id: 'existing-tx' } });
    expect(stub.find('POST', '/rest/v1/notifications')).toHaveLength(0);
  });

  it('losing the insert race to the unique index resolves to the winner', async () => {
    stubJob(jobRow());
    stub.on('GET', '/rest/v1/categories', () => rows([category]));
    let lookups = 0;
    stub.on('GET', '/rest/v1/transactions', () => rows(++lookups === 1 ? [] : [{ id: 'winner', user_id: USER_ID }]));
    stub.on('POST', '/rest/v1/transactions', () => pgError('23505', 'duplicate key value violates unique constraint "transactions_user_payment_hash_active_uidx"', 409));
    stubDeepSeek(parsedSms());
    const m = msg();
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(jobPatches().at(-1)).toMatchObject({ status: 'done', result: { transaction_id: 'winner' } });
  });
});

describe('processIngestMessage: receipt and voice pipelines', () => {
  it('receipt: Groq gets a short-lived signed URL (nothing downloaded), parse, detected_via=scan and the object path', async () => {
    const payload = mediaPayload();
    stubJob(jobRow({ kind: 'receipt', payload }));
    stubCapture();
    stub.on('POST', '/storage/v1/object/sign/Dime-private/', () =>
      json({ signedURL: `/object/sign/Dime-private/${payload.object_path}?token=abc` }),
    );
    stubDeepSeek(parsedSms());
    const m = new FakeMessage({ job_id: JOB, kind: 'receipt' });
    await processIngestMessage(m, deps());

    expect(m.acked).toBe(true);
    expect(stub.find('GET', '/storage/v1/object/Dime-private/')).toHaveLength(0);
    const sign = stub.last('POST', '/storage/v1/object/sign/Dime-private/');
    expect(sign.body).toEqual({ expiresIn: 300 });
    const groq = stub.find('POST', '/chat/completions').find((c) => c.url.host === 'api.groq.com');
    const url = (groq?.body as { messages: { content: { image_url?: { url: string } }[] }[] }).messages[0]?.content[1]?.image_url?.url;
    expect(url?.startsWith('https://') && url.includes('/storage/v1/object/sign/Dime-private/') && url.endsWith('?token=abc')).toBe(true);
    expect(JSON.stringify(groq?.body)).not.toContain('base64');
    expect(insertedTx()).toMatchObject({ detected_via: 'scan', receipt_url: payload.object_path, voice_url: null });
    expect(jobPatches().at(-1)).toMatchObject({ status: 'done', result: { transaction_id: TX } });
  });

  it('receipt: when signing fails it downloads the object and sends base64, stores detected_via=scan and the object path', async () => {
    const payload = mediaPayload();
    stubJob(jobRow({ kind: 'receipt', payload }));
    stubCapture();
    stub.on('GET', '/storage/v1/object/Dime-private/receipts', () => new Response(JPEG, { headers: { 'content-type': 'image/jpeg' } }));
    stubDeepSeek(parsedSms());
    const m = new FakeMessage({ job_id: JOB, kind: 'receipt' });
    await processIngestMessage(m, deps());

    expect(m.acked).toBe(true);
    expect(stub.last('GET', '/storage/v1/object/Dime-private/receipts').path).toContain(payload.object_path);
    const groq = stub.find('POST', '/chat/completions').find((c) => c.url.host === 'api.groq.com');
    expect(JSON.stringify(groq?.body)).toContain('data:image/jpeg;base64,');
    const deepseek = stub.find('POST', '/chat/completions').find((c) => c.url.host === 'api.deepseek.com');
    expect(JSON.stringify(deepseek?.body)).toContain('OCR TEXT SWIGGY 250.50');
    expect(insertedTx()).toMatchObject({ detected_via: 'scan', receipt_url: payload.object_path, voice_url: null, transaction_at: '2026-10-03T00:00:00.000Z' });
    expect(jobPatches().at(-1)).toMatchObject({ status: 'done', result: { transaction_id: TX } });
  });

  it('voice: Whisper primary fails, fallback transcribes, parse stores detected_via=voice', async () => {
    const payload = mediaPayload({ object_path: `voice_inputs/${USER_ID}/voice_inputs/2026-10-04/1-abcd1234.m4a`, mime_type: 'audio/mp4' });
    stubJob(jobRow({ kind: 'voice', payload }));
    stubCapture();
    stub.on('GET', '/storage/v1/object/Dime-private/voice_inputs', () => new Response(M4A));
    let whisper = 0;
    stub.on('POST', '/audio/transcriptions', () => (++whisper === 1 ? json({}, { status: 500 }) : json({ text: 'spent two fifty on dinner at swiggy' })));
    stubDeepSeek(parsedSms());
    const m = new FakeMessage({ job_id: JOB, kind: 'voice' });
    await processIngestMessage(m, deps());

    expect(m.acked).toBe(true);
    expect(whisper).toBe(2);
    const deepseek = stub.find('POST', '/chat/completions').find((c) => c.url.host === 'api.deepseek.com');
    expect(JSON.stringify(deepseek?.body)).toContain('spent two fifty on dinner at swiggy');
    expect(insertedTx()).toMatchObject({ detected_via: 'voice', voice_url: payload.object_path, receipt_url: null });
    expect(jobPatches().at(-1)).toMatchObject({ status: 'done' });
  });

  it('a stored payload that does not validate fails permanently', async () => {
    stubJob(jobRow({ kind: 'receipt', payload: { nonsense: true } }));
    stub.on('GET', '/rest/v1/user_settings', () => rows([settings]));
    stub.on('POST', '/rest/v1/notifications', () => rows([{ id: 'n' }]));
    stub.on('GET', '/rest/v1/push_tokens', () => rows([]));
    const m = new FakeMessage({ job_id: JOB, kind: 'receipt' });
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(jobPatches().at(-1)).toMatchObject({ status: 'failed', last_error: 'InvalidJobError: Job payload is invalid.' });
  });
});

describe('processIngestMessage: claiming', () => {
  it('a job that is already processing/done is not touched: the duplicate message is acked', async () => {
    for (const status of ['processing', 'done', 'failed']) {
      stub.calls.length = 0;
      (stub as unknown as { routes: unknown[] }).routes = [];
      stubJob(jobRow({ status }));
      const m = msg();
      await processIngestMessage(m, deps());
      expect(m.acked, status).toBe(true);
      expect(stub.find('PATCH', '/rest/v1/jobs'), status).toHaveLength(0);
      expect(stub.find('POST', '/chat/completions'), status).toHaveLength(0);
    }
  });

  it('losing the claim race (conditional update matches nothing) acks without work', async () => {
    stubJob(jobRow(), { claimLost: true });
    const m = msg();
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(stub.find('POST', '/chat/completions')).toHaveLength(0);
    expect(jobPatches()).toHaveLength(1);
  });

  it('two deliveries of one job run the pipeline once', async () => {
    const row = jobRow();
    let status = 'pending';
    stub.on('GET', '/rest/v1/jobs', () => rows([{ ...row, status }]));
    stub.on('PATCH', '/rest/v1/jobs', (c) => {
      const body = c.body as { status: string };
      if (body.status !== 'processing') return rows([row]);
      if (status !== 'pending') return rows([]);
      status = 'processing';
      return rows([{ ...row, status, attempts: 1 }]);
    });
    stubCapture();
    stubDeepSeek(parsedSms());
    const [a, b] = [msg(), msg()];
    await Promise.all([processIngestMessage(a, deps()), processIngestMessage(b, deps())]);
    expect(a.acked && b.acked).toBe(true);
    expect(stub.find('POST', '/rest/v1/transactions')).toHaveLength(1);
  });

  it('an exhausted job (attempts >= 3) is failed by the claim itself with "max attempts exceeded"', async () => {
    stubJob(jobRow({ attempts: 3 }));
    const m = msg();
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(jobPatches()).toEqual([expect.objectContaining({ status: 'failed', last_error: 'max attempts exceeded' })]);
    expect(stub.find('POST', '/chat/completions')).toHaveLength(0);
  });

  it('a malformed queue message is acked and dropped', async () => {
    for (const body of [null, 'x', { job_id: 5 }, { job_id: 'a', kind: 'weird' }]) {
      const m = new FakeMessage(body);
      await processIngestMessage(m, deps());
      expect(m.acked).toBe(true);
    }
    expect(stub.calls).toHaveLength(0);
  });

  it('a database error while claiming retries the message (the job is still pending)', async () => {
    stub.on('GET', '/rest/v1/jobs', () => pgError('XX000', 'down', 500));
    const m = msg();
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(false);
    expect(m.retried).toEqual({ delaySeconds: 10 });
  });
});

describe('processIngestMessage: failures', () => {
  it('transient upstream error: release to pending and retry with backoff (no failure, no notification)', async () => {
    stubJob(jobRow());
    stub.on('GET', '/rest/v1/categories', () => rows([category]));
    stub.on('POST', '/chat/completions', () => json({ error: 'overloaded' }, { status: 503 }));
    const m = msg();
    await processIngestMessage(m, deps());

    expect(m.acked).toBe(false);
    expect(m.retried).toEqual({ delaySeconds: 5 });
    const last = stub.find('PATCH', '/rest/v1/jobs').at(-1);
    expect(last?.body).toMatchObject({ status: 'pending' });
    // Backdated one second so the sweep (120 s) does not race the queue redelivery.
    expect(Date.now() - Date.parse((last?.body as { updated_at: string }).updated_at)).toBeGreaterThanOrEqual(1000);
    expect(last?.params.get('status')).toBe('in.(pending,processing)');
    expect(jobPatches().some((p) => p['status'] === 'failed')).toBe(false);
    expect(stub.find('POST', '/rest/v1/notifications')).toHaveLength(0);
  });

  it('backoff grows with the attempt number', async () => {
    stubJob(jobRow({ attempts: 1 })); // claimed as attempt 2
    stub.on('GET', '/rest/v1/categories', () => rows([category]));
    stub.on('POST', '/chat/completions', () => json({}, { status: 429 }));
    const m = msg(2);
    await processIngestMessage(m, deps());
    expect(m.retried).toEqual({ delaySeconds: 10 });
  });

  it('the final attempt fails the job for good even when the error is transient, and notifies', async () => {
    stubJob(jobRow({ attempts: 2 })); // claim makes it attempt 3
    stub.on('GET', '/rest/v1/categories', () => rows([category]));
    stub.on('POST', '/chat/completions', () => json({}, { status: 503 }));
    stub.on('GET', '/rest/v1/user_settings', () => rows([settings]));
    stub.on('POST', '/rest/v1/notifications', (c) => rows([{ id: 'n', ...(c.body as object) }]));
    stub.on('GET', '/rest/v1/push_tokens', () => rows([]));
    const m = msg(3);
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(m.retried).toBeUndefined();
    expect(jobPatches().at(-1)).toMatchObject({ status: 'failed', last_error: 'TransientAiError: AI_PARSE_UNAVAILABLE' });
    expect(notificationPosts()).toHaveLength(1);
  });

  it('permanent error: failed (last_error <= 500 chars) + capture_failed notification for sms, then ack', async () => {
    stubJob(jobRow());
    stub.on('GET', '/rest/v1/categories', () => rows([category]));
    stub.on('POST', '/chat/completions', () => json(completion('this is not json')));
    stub.on('GET', '/rest/v1/user_settings', () => rows([settings]));
    stub.on('POST', '/rest/v1/notifications', (c) => rows([{ id: 'n', ...(c.body as object) }]));
    stub.on('GET', '/rest/v1/push_tokens', () => rows([]));
    const m = msg();
    await processIngestMessage(m, deps());

    expect(m.acked).toBe(true);
    const failed = jobPatches().at(-1) as { status: string; last_error: string };
    expect(failed.status).toBe('failed');
    expect(failed.last_error.length).toBeLessThanOrEqual(500);
    expect(failed.last_error).toContain('AI_PARSE_UNAVAILABLE');
    const today = new Date().toISOString().slice(0, 10);
    expect(notificationPosts()).toEqual([
      expect.objectContaining({
        kind: 'capture_failed',
        title: 'SMS capture failed',
        body: "We couldn't read this bank message. Try again or add manually.",
        dedupe_key: `capture_failed:sms:${today}`,
        action_type: 'manual_add',
      }),
    ]);
  });

  it('receipt failures notify with source scan; voice failures send nothing', async () => {
    const run = async (kind: 'receipt' | 'voice') => {
      stub.calls.length = 0;
      (stub as unknown as { routes: unknown[] }).routes = [];
      stubJob(jobRow({ kind, payload: mediaPayload(), attempts: 2 }));
      stub.on('GET', '/storage/v1/object/Dime-private/', () => new Response(null, { status: 404 }));
      stub.on('GET', '/rest/v1/user_settings', () => rows([settings]));
      stub.on('POST', '/rest/v1/notifications', (c) => rows([{ id: 'n', ...(c.body as object) }]));
      stub.on('GET', '/rest/v1/push_tokens', () => rows([]));
      stub.on('GET', '/rest/v1/categories', () => rows([category]));
      // A missing object is an upstream (transient) problem; exhaust the attempts to reach the failure path.
      const m = new FakeMessage({ job_id: JOB, kind }, 3);
      await processIngestMessage(m, deps());
      expect(m.acked).toBe(true);
      return notificationPosts();
    };
    const scan = await run('receipt');
    expect(scan).toEqual([expect.objectContaining({ kind: 'capture_failed', title: 'Receipt scan failed', dedupe_key: expect.stringContaining('capture_failed:scan:') as string })]);
    expect(await run('voice')).toEqual([]);
  });

  it('respects capture_failed_alerts_enabled=false and survives a notification error', async () => {
    stubJob(jobRow());
    stub.on('GET', '/rest/v1/categories', () => rows([category]));
    stub.on('POST', '/chat/completions', () => json({ error: 'bad' }, { status: 400 }));
    stub.on('GET', '/rest/v1/user_settings', () => rows([{ capture_failed_alerts_enabled: false }]));
    const m = msg();
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(stub.find('POST', '/rest/v1/notifications')).toHaveLength(0);

    stub.calls.length = 0;
    (stub as unknown as { routes: unknown[] }).routes = [];
    stubJob(jobRow());
    stub.on('GET', '/rest/v1/categories', () => rows([category]));
    stub.on('POST', '/chat/completions', () => json({ error: 'bad' }, { status: 400 }));
    stub.on('GET', '/rest/v1/user_settings', () => pgError('XX000', 'down', 500));
    const m2 = msg();
    await processIngestMessage(m2, deps());
    expect(m2.acked).toBe(true);
    expect(jobPatches().at(-1)).toMatchObject({ status: 'failed' });
  });

  it('classifies errors', () => {
    expect(isTransientError(new TransientAiError('x'))).toBe(true);
    expect(isTransientError(new UpstreamError('x'))).toBe(true);
    expect(isTransientError(new InvalidJobError('x'))).toBe(false);
    expect(isTransientError(Object.assign(new Error('TypeError: fetch failed'), { code: '' }))).toBe(true);
    expect(isTransientError(Object.assign(new Error('x'), { code: '08006' }))).toBe(true);
    expect(isTransientError(Object.assign(new Error('x'), { code: '23505' }))).toBe(false);
    expect(isTransientError(new DOMException('t', 'TimeoutError'))).toBe(true);
    expect(isTransientError(new Error('boom'))).toBe(false);
  });

  it('injectable runner: a thrown permanent error fails, a thrown transient error retries', async () => {
    stubJob(jobRow());
    const bad = msg();
    await processIngestMessage(bad, deps({ run: () => Promise.reject(new Error('nope')) }));
    expect(bad.acked).toBe(true);

    stub.calls.length = 0;
    const slow = msg();
    await processIngestMessage(slow, deps({ run: () => Promise.reject(new TransientAiError('later')) }));
    expect(slow.retried).toEqual({ delaySeconds: 5 });
  });
});

describe('queue handlers', () => {
  it('handleIngestBatch processes every message of the batch', async () => {
    stubJob(jobRow());
    stubCapture();
    stubDeepSeek(parsedSms());
    const messages = [msg(), msg(), msg()];
    await handleIngestBatch(fakeBatch('dime-ingest', messages), env());
    expect(messages.every((m) => m.acked)).toBe(true);
  });

  it('one crashing message does not take the others down', async () => {
    stub.on('GET', '/rest/v1/jobs', () => pgError('XX000', 'down', 500));
    const messages = [msg(), msg()];
    await handleIngestBatch(fakeBatch('dime-ingest', messages), env());
    expect(messages.map((m) => m.retried)).toEqual([{ delaySeconds: 10 }, { delaySeconds: 10 }]);
  });

  it('index.queue routes by queue name (prod and staging) and stubs the email queue', async () => {
    stubJob(jobRow({ status: 'done' }));
    const ctx = {} as ExecutionContext;
    const ingest = msg();
    await worker.queue?.(fakeBatch('dime-ingest-staging', [ingest]), env(), ctx);
    expect(ingest.acked).toBe(true);
    expect(stub.find('GET', '/rest/v1/jobs')).toHaveLength(1);

    stub.calls.length = 0;
    (stub as unknown as { routes: unknown[] }).routes = [];
    stub.on('PATCH', '/rest/v1/jobs', () => rows([{ id: JOB, user_id: USER_ID, kind: 'sms' }]));
    stub.on('GET', '/rest/v1/user_settings', () => rows([settings]));
    stub.on('POST', '/rest/v1/notifications', () => rows([{ id: 'n' }]));
    stub.on('GET', '/rest/v1/push_tokens', () => rows([]));
    const dlq = msg();
    await worker.queue?.(fakeBatch('dime-ingest-dlq', [dlq]), env(), ctx);
    expect(dlq.acked).toBe(true);
    expect(stub.find('PATCH', '/rest/v1/jobs')).toHaveLength(1); // the DLQ handler, not the ingest one

    const email = msg();
    await worker.queue?.(fakeBatch('dime-email', [email]), env(), ctx);
    expect(email.acked).toBe(true);
  });
});

describe('DLQ handler', () => {
  it('fails an unfinished job conditionally, notifies, and acks (idempotent)', async () => {
    stub.on('PATCH', '/rest/v1/jobs', () => rows([{ id: JOB, user_id: USER_ID, kind: 'receipt' }]));
    stub.on('GET', '/rest/v1/user_settings', () => rows([settings]));
    stub.on('POST', '/rest/v1/notifications', (c) => rows([{ id: 'n', ...(c.body as object) }]));
    stub.on('GET', '/rest/v1/push_tokens', () => rows([]));
    const m = new FakeMessage({ job_id: JOB, kind: 'receipt' });
    await handleIngestDlq(fakeBatch('dime-ingest-dlq', [m]), env());

    expect(m.acked).toBe(true);
    const patch = stub.last('PATCH', '/rest/v1/jobs');
    expect(patch.params.get('id')).toBe(`eq.${JOB}`);
    expect(patch.params.get('status')).toBe('in.(pending,processing)'); // never overwrites a finished job
    expect(patch.body).toMatchObject({ status: 'failed', last_error: expect.stringContaining('Dead-lettered') as string });
    expect(notificationPosts()).toEqual([expect.objectContaining({ kind: 'capture_failed', title: 'Receipt scan failed' })]);
  });

  it('a job that already finished is left alone: no notification, still acked', async () => {
    stub.on('PATCH', '/rest/v1/jobs', () => rows([])); // conditional update matched nothing
    const m = msg();
    await handleIngestDlq(fakeBatch('dime-ingest-dlq', [m]), env());
    expect(m.acked).toBe(true);
    expect(stub.find('POST', '/rest/v1/notifications')).toHaveLength(0);
  });

  it('acks malformed messages and retries when the database is down', async () => {
    const bad = new FakeMessage({ nope: 1 });
    await handleIngestDlq(fakeBatch('dime-ingest-dlq', [bad]), env());
    expect(bad.acked).toBe(true);

    stub.on('PATCH', '/rest/v1/jobs', () => pgError('XX000', 'down', 500));
    const m = msg();
    await handleIngestDlq(fakeBatch('dime-ingest-dlq', [m]), env());
    expect(m.acked).toBe(false);
    expect(m.retried).toEqual({ delaySeconds: 30 });
  });
});

const controller = (cron: string) => ({ cron, scheduledTime: Date.now(), type: 'scheduled', noRetry: () => undefined }) as ScheduledController;

describe('recovery sweep', () => {
  const NOW = Date.parse('2026-10-04T12:00:00.000Z');

  it('re-sends stale pending jobs and re-queues stale processing ones (conditionally), oldest first, per kind', async () => {
    stub.on('GET', '/rest/v1/jobs', (c) => {
      const kind = c.params.get('kind');
      if (kind === 'eq.receipt') return rows([jobRow({ id: 'r-pending', kind: 'receipt', status: 'pending' }), jobRow({ id: 'r-proc', kind: 'receipt', status: 'processing' })]);
      if (kind === 'eq.sms') return rows([jobRow({ id: 's-lost-race', kind: 'sms', status: 'processing' })]);
      return rows([]);
    });
    stub.on('PATCH', '/rest/v1/jobs', (c) => rows(c.params.get('id') === 'eq.s-lost-race' ? [] : [{ id: c.params.get('id')?.slice(3) }]));
    const queue = new FakeQueue();
    const db = createServiceClient(env());
    const result = await sweepJobs(db, queue.asQueue(), NOW);

    const list = stub.find('GET', '/rest/v1/jobs');
    expect(list).toHaveLength(3);
    for (const c of list) {
      expect(c.params.get('status')).toBe('in.(pending,processing)');
      expect(c.params.get('updated_at')).toBe(`lt.${new Date(NOW - 120_000).toISOString()}`);
      expect(c.params.get('order')).toBe('updated_at.asc');
      expect(c.params.get('limit')).toBe('50');
    }
    const requeue = stub.find('PATCH', '/rest/v1/jobs');
    expect(requeue).toHaveLength(2);
    expect(requeue[0]?.params.get('status')).toBe('eq.processing');
    expect(requeue[0]?.params.get('updated_at')).toBe(`lt.${new Date(NOW - 120_000).toISOString()}`);

    expect(queue.sent).toEqual([
      { job_id: 'r-pending', kind: 'receipt' },
      { job_id: 'r-proc', kind: 'receipt' },
    ]);
    expect(result).toEqual({ requeued: 1, resent: 2 });
  });

  it('does nothing (and sends nothing) when no job is stale', async () => {
    stub.on('GET', '/rest/v1/jobs', () => rows([]));
    const queue = new FakeQueue();
    expect(await sweepJobs(createServiceClient(env()), queue.asQueue(), NOW)).toEqual({ requeued: 0, resent: 0 });
    expect(queue.sent).toEqual([]);
    expect(stub.find('PATCH', '/rest/v1/jobs')).toHaveLength(0);
  });

  it('a queue failure is not fatal: the jobs stay pending for the next sweep', async () => {
    stub.on('GET', '/rest/v1/jobs', (c) => rows(c.params.get('kind') === 'eq.voice' ? [jobRow({ id: 'v', kind: 'voice', status: 'pending' })] : []));
    const queue = new FakeQueue();
    queue.failWith = new Error('down');
    expect(await sweepJobs(createServiceClient(env()), queue.asQueue(), NOW)).toEqual({ requeued: 0, resent: 0 });
  });

  it('sends in batches of at most 100', async () => {
    const many = Array.from({ length: 50 }, (_, i) => jobRow({ id: `j${i}`, status: 'pending' }));
    stub.on('GET', '/rest/v1/jobs', () => rows(many));
    const queue = new FakeQueue();
    const batches: number[] = [];
    queue.sendBatch = (messages) => {
      const list = [...messages];
      batches.push(list.length);
      queue.sent.push(...list.map((m) => m.body));
      return Promise.resolve();
    };
    await sweepJobs(createServiceClient(env()), queue.asQueue(), NOW);
    expect(batches).toEqual([100, 50]); // 3 kinds x 50 stale jobs
  });

  it('scheduled() dispatches by cron: the sweep for */5, a stub for the email digest', async () => {
    stub.on('GET', '/rest/v1/jobs', () => rows([jobRow({ id: 'x', status: 'pending' })]));
    const queue = new FakeQueue();
    const e = { ...env(), INGEST_QUEUE: queue.asQueue() } as Bindings;
    const ctx = {} as ExecutionContext;
    await worker.scheduled?.(controller('*/5 * * * *'), e, ctx);
    expect(queue.sent.length).toBeGreaterThan(0);

    const before = stub.calls.length;
    await worker.scheduled?.(controller('30 2 * * *'), e, ctx);
    await worker.scheduled?.(controller('1 1 1 1 1'), e, ctx);
    expect(stub.calls.length).toBe(before);
  });
});
