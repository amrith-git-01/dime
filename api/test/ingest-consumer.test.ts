import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { getConfig } from '../src/core/env';
import type { Bindings } from '../src/core/env';
import { TransientAiError } from '../src/features/ai/errors';
import { handleIngestBatch, handleIngestDlq, isTransientError, processIngestMessage } from '../src/features/ingest/consumer';
import type { IngestDeps } from '../src/features/ingest/consumer';
import { InvalidJobError } from '../src/features/ingest/pipeline';
import { mediaStore } from '../src/features/media/storage';
import { sweepJobs } from '../src/features/ingest/sweep';
import { buildPaymentHash } from '../src/features/transactions/dedupe';
import worker from '../src/index';
import { UpstreamError } from '../src/core/errors';
import { USER_ID, makeEnv } from './helpers';
import { failingOn, oneRow, rowsOf, seedCategory, seedJob, seedSettings, seedTransaction, testDb, withBeforeExec } from './db';
import { CAT_FOOD, FakeAi, FakeMessage, FakeQueue, JOB, JPEG, M4A, TX, completion, fakeBatch, mediaPayload, parsedSms } from './ingest-fixtures';
import { json, useSupabaseStub } from './supabase-stub';

// Jobs, transactions and notifications are real rows in D1; media is real R2; the stub plays DeepSeek and FakeAi plays Workers AI.
const stub = useSupabaseStub();
const fakeAi = new FakeAi();
beforeEach(() => {
  fakeAi.calls.length = 0;
  fakeAi.respond = new FakeAi().respond;
});

const env = (): Bindings => makeEnv({ DEEPSEEK_API_KEY: 'ds-key' });
const deps = (over: Partial<IngestDeps> = {}): IngestDeps => ({ db: testDb(), storage: mediaStore(env()), config: getConfig(env()), ai: fakeAi.asAi(), ...over });
const msg = (attempts = 1, jobId = JOB) => new FakeMessage({ job_id: jobId, kind: 'receipt' }, attempts);
const JOB2 = 'aaaaaaaa-0000-0000-0000-00000000000d';

interface JobRecord {
  id: string;
  status: string;
  attempts: number;
  last_error: string | null;
  result: string | null;
  updated_at: string;
  payload: string;
}
const job = (id = JOB) => oneRow<JobRecord>('jobs', 'id = ?', id);
const result = async (id = JOB) => JSON.parse((await job(id))?.result ?? 'null') as unknown;

/** The "Food" category the parsed receipt names. */
const seedFood = () => seedCategory({ id: CAT_FOOD, name: 'Food', icon_name: 'Utensils', color: '#111111' });
/** A pending receipt job whose image sits in R2 (Workers AI is the fake: it "reads" OCR TEXT SWIGGY 250.50). */
const seedPending = async (over: Parameters<typeof seedJob>[0] = {}) => {
  const payload = mediaPayload();
  await workerEnv.MEDIA.put(payload.object_path, JPEG, { httpMetadata: { contentType: 'image/jpeg' } });
  return seedJob({ id: JOB, kind: 'receipt', payload, ...over });
};
const notifications = () => rowsOf<Record<string, unknown>>('notifications');
const transactions = () => rowsOf<Record<string, unknown>>('transactions');

const stubDeepSeek = (content: string) =>
  stub.on('POST', '/chat/completions', () => json(completion(content)));

/** The hash `parsedSms()` produces (Swiggy, 250.50 debit, 2026-10-03 00:00 UTC). */
const swiggyHash = () =>
  buildPaymentHash({ amount: '250.50', type: 'debit', counterpartyNormalized: 'swiggy', counterpartyName: 'Swiggy', transactionAtMs: Date.parse('2026-10-03T00:00:00.000Z') });

describe('processIngestMessage: success', () => {
  it('claims, parses, creates the transaction with server-set fields, notifies and marks done', async () => {
    await seedFood();
    await seedPending();
    stubDeepSeek(parsedSms({ type: 'credit', amount: 1500, counterparty_name: 'ACME', date: null, category: 'Food' }));
    const m = msg();
    await processIngestMessage(m, deps());

    expect(m.acked).toBe(true);
    expect(m.retried).toBeUndefined();

    const [tx] = await transactions();
    expect(tx).toMatchObject({
      user_id: USER_ID,
      amount: 150000,
      type: 'credit',
      detected_via: 'scan',
      receipt_url: mediaPayload().object_path,
      voice_url: null,
      counterparty_name: 'ACME',
      category_id: CAT_FOOD,
    });

    // pending -> processing (attempts + 1) -> done with the transaction id.
    // No date from the model: the time of the capture is used.
    expect(Date.now() - Date.parse(String(tx?.['transaction_at']))).toBeLessThan(60_000);
    expect(await job()).toMatchObject({ status: 'done', attempts: 1 });
    expect(await result()).toEqual({ transaction_id: tx?.['id'] });

    expect(await notifications()).toEqual([
      expect.objectContaining({
        kind: 'transaction_auto',
        dedupe_key: `transaction_auto:${String(tx?.['id'])}`,
        title: '₹1,500 added',
        body: 'ACME · Food',
        action_transaction_id: tx?.['id'],
      }),
    ]);
  });

  it('the claim is a conditional pending -> processing with attempts + 1, taken before the pipeline runs', async () => {
    await seedPending();
    let seen: JobRecord | null = null;
    const m = msg();
    await processIngestMessage(m, deps({ run: async () => { seen = await job(); return { transactionId: TX, created: false }; } }));
    expect(seen).toMatchObject({ status: 'processing', attempts: 1 });
    expect(await job()).toMatchObject({ status: 'done', attempts: 1 });
    expect(await result()).toEqual({ transaction_id: TX });
  });

  describe('captured_at (offline captures)', () => {
    const CAPTURED = '2026-10-10T20:30:00.000Z'; // 2026-10-11 02:00 in Kolkata, a Sunday
    const prompt = () => String((stub.last('POST', '/chat/completions').body as { messages: { content: string }[] }).messages[0]?.content);

    it('uses the stored capture time when the model finds no date, and tells the parser the capture\'s local date', async () => {
      await seedFood();
      await seedPending({ payload: mediaPayload({ captured_at: CAPTURED }) });
      stubDeepSeek(parsedSms({ date: null }));
      const m = msg();
      await processIngestMessage(m, deps());
      expect(m.acked).toBe(true);
      expect((await transactions())[0]?.['transaction_at']).toBe(CAPTURED);
      expect(prompt()).toContain('Reference date (the day this was captured): 2026-10-11 (Sunday).');
    });

    it('a model date after the capture day is dropped; an earlier one is kept', async () => {
      await seedFood();
      await seedPending({ payload: mediaPayload({ captured_at: CAPTURED }) });
      stubDeepSeek(parsedSms({ date: '2026-10-12' }));
      await processIngestMessage(msg(), deps());
      expect((await transactions())[0]?.['transaction_at']).toBe(CAPTURED);
    });

    it('a model date on or before the capture day is kept for receipts', async () => {
      await seedFood();
      await seedPending({ payload: mediaPayload({ captured_at: CAPTURED }) });
      stubDeepSeek(parsedSms({ date: '2026-10-09' }));
      await processIngestMessage(msg(), deps());
      expect((await transactions())[0]?.['transaction_at']).toBe('2026-10-09T00:00:00.000Z');
    });

    it('a jobs without captured_at (queued before the field existed) falls back to now', async () => {
      await seedFood();
      await seedPending();
      stubDeepSeek(parsedSms({ date: null }));
      await processIngestMessage(msg(), deps());
      expect(Date.now() - Date.parse(String((await transactions())[0]?.['transaction_at']))).toBeLessThan(60_000);
      expect(prompt()).toContain('Reference date (the day this was captured):');
    });
  });

  it('a debit still completes when the follow-up notifications fail', async () => {
    await seedFood();
    await seedPending();
    stubDeepSeek(parsedSms());
    const m = msg();
    await processIngestMessage(m, deps({ db: failingOn(/user_settings/, 'D1_ERROR: settings unavailable') }));
    expect(m.acked).toBe(true);
    expect(await transactions()).toHaveLength(1);
    expect(await job()).toMatchObject({ status: 'done' });
  });

  it('a duplicate payment is merged and reported as the existing transaction (no notification)', async () => {
    await seedFood();
    await seedPending();
    await seedTransaction({
      id: TX,
      amount: '250.50',
      counterparty_name: 'Swiggy',
      counterparty_normalized: 'swiggy',
      payment_hash: await swiggyHash(),
      category_id: CAT_FOOD,
      note: 'kept',
      transaction_at: '2026-10-03T00:00:00.000Z',
    });
    stubDeepSeek(parsedSms());
    const m = msg();
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(await transactions()).toHaveLength(1);
    expect(await oneRow('transactions', 'id = ?', TX)).toMatchObject({ note: 'kept' });
    expect(await result()).toEqual({ transaction_id: TX });
    expect(await notifications()).toHaveLength(0);
  });

  it('a duplicate fills only the fields the existing row lacks', async () => {
    await seedFood();
    await seedPending();
    await seedTransaction({
      id: TX,
      amount: '250.50',
      counterparty_name: 'Swiggy',
      counterparty_normalized: 'swiggy',
      payment_hash: await swiggyHash(),
      category_id: null,
      note: null,
      transaction_at: '2026-10-03T00:00:00.000Z',
    });
    stubDeepSeek(parsedSms());
    await processIngestMessage(msg(), deps());
    expect(await oneRow('transactions', 'id = ?', TX)).toMatchObject({ category_id: CAT_FOOD, note: 'Dinner from Swiggy' });
  });

  it('two jobs for the same payment: one transaction, both jobs resolve to it (insert race resolves to the winner)', async () => {
    await seedFood();
    await seedPending();
    await seedPending({ id: JOB2 });
    stubDeepSeek(parsedSms());
    const [a, b] = [msg(), msg(1, JOB2)];
    await Promise.all([processIngestMessage(a, deps()), processIngestMessage(b, deps())]);
    expect(a.acked && b.acked).toBe(true);
    const txs = await transactions();
    expect(txs).toHaveLength(1);
    expect(await result(JOB)).toEqual({ transaction_id: txs[0]?.['id'] });
    expect(await result(JOB2)).toEqual({ transaction_id: txs[0]?.['id'] });
    // Only the creator notifies.
    expect(await notifications()).toHaveLength(1);
  });
});

describe('processIngestMessage: receipt and voice pipelines', () => {
  it('receipt: the object is read from R2 and sent to Workers AI as a base64 data URL; parse, detected_via=scan and the object path', async () => {
    const payload = mediaPayload();
    await seedFood();
    await seedJob({ id: JOB, kind: 'receipt', payload });
    await workerEnv.MEDIA.put(payload.object_path, JPEG, { httpMetadata: { contentType: 'image/jpeg' } });
    stubDeepSeek(parsedSms());
    const m = new FakeMessage({ job_id: JOB, kind: 'receipt' });
    await processIngestMessage(m, deps());

    expect(m.acked).toBe(true);
    expect(fakeAi.calls).toHaveLength(1);
    const call = fakeAi.calls[0];
    expect(call?.model).toBe('@cf/meta/llama-4-scout-17b-16e-instruct');
    const url = (call?.inputs as { messages: { content: { image_url?: { url: string } }[] }[] }).messages[0]?.content[1]?.image_url?.url;
    expect(url).toMatch(/^data:image\/jpeg;base64,\/9j\/4AAQSkZJRg/);
    const deepseek = stub.find('POST', '/chat/completions').find((c) => c.url.host === 'api.deepseek.com');
    expect(JSON.stringify(deepseek?.body)).toContain('OCR TEXT SWIGGY 250.50');
    const [tx] = await transactions();
    expect(tx).toMatchObject({ detected_via: 'scan', receipt_url: payload.object_path, voice_url: null, transaction_at: '2026-10-03T00:00:00.000Z' });
    expect(await result()).toEqual({ transaction_id: tx?.['id'] });
    expect(await job()).toMatchObject({ status: 'done' });
  });

  it('voice: Whisper transcribes the stored audio, parse stores detected_via=voice', async () => {
    const payload = mediaPayload({ object_path: `voice_inputs/${USER_ID}/voice_inputs/2026-10-04/1-abcd1234.m4a`, mime_type: 'audio/mp4' });
    await seedFood();
    await seedJob({ id: JOB, kind: 'voice', payload });
    await workerEnv.MEDIA.put(payload.object_path, M4A, { httpMetadata: { contentType: 'audio/mp4' } });
    stubDeepSeek(parsedSms());
    const m = new FakeMessage({ job_id: JOB, kind: 'voice' });
    await processIngestMessage(m, deps());

    expect(m.acked).toBe(true);
    expect(fakeAi.calls.map((c) => c.model)).toEqual(['@cf/openai/whisper-large-v3-turbo']);
    expect(typeof fakeAi.calls[0]?.inputs['audio']).toBe('string');
    const deepseek = stub.find('POST', '/chat/completions').find((c) => c.url.host === 'api.deepseek.com');
    expect(JSON.stringify(deepseek?.body)).toContain('spent two fifty on dinner at swiggy');
    expect((await transactions())[0]).toMatchObject({ detected_via: 'voice', voice_url: payload.object_path, receipt_url: null });
    expect(await job()).toMatchObject({ status: 'done' });
  });

  it('a stored payload that does not validate fails permanently', async () => {
    await seedJob({ id: JOB, kind: 'receipt', payload: { nonsense: true } });
    const m = new FakeMessage({ job_id: JOB, kind: 'receipt' });
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(await job()).toMatchObject({ status: 'failed', last_error: 'InvalidJobError: Job payload is invalid.' });
  });
});

describe('processIngestMessage: claiming', () => {
  it.each(['processing', 'done', 'failed'])('a %s job is not touched: the duplicate message is acked', async (status) => {
    await seedPending({ status });
    const before = await job();
    const m = msg();
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(await job()).toEqual(before);
    expect(stub.find('POST', '/chat/completions')).toHaveLength(0);
  });

  it('losing the claim race (another worker claims between the read and the update) acks without work', async () => {
    await seedPending();
    const loser = withBeforeExec(/UPDATE jobs SET status = 'processing'/, async () => {
      await testDb().prepare("UPDATE jobs SET status = 'processing', attempts = 1 WHERE id = ?").bind(JOB).run();
    });
    const m = msg();
    await processIngestMessage(m, deps({ db: loser }));
    expect(m.acked).toBe(true);
    expect(stub.find('POST', '/chat/completions')).toHaveLength(0);
    expect(await job()).toMatchObject({ status: 'processing', attempts: 1 });
  });

  it('two deliveries of one job run the pipeline once', async () => {
    await seedFood();
    await seedPending();
    stubDeepSeek(parsedSms());
    const [a, b] = [msg(), msg()];
    await Promise.all([processIngestMessage(a, deps()), processIngestMessage(b, deps())]);
    expect(a.acked && b.acked).toBe(true);
    expect(await transactions()).toHaveLength(1);
    expect(stub.find('POST', '/chat/completions').filter((c) => c.url.host === 'api.deepseek.com')).toHaveLength(1);
    expect(await job()).toMatchObject({ status: 'done', attempts: 1 });
  });

  it('an exhausted job (attempts >= 3) is failed by the claim itself with "max attempts exceeded"', async () => {
    await seedPending({ attempts: 3 });
    const m = msg();
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(await job()).toMatchObject({ status: 'failed', last_error: 'max attempts exceeded', attempts: 3 });
    expect(stub.find('POST', '/chat/completions')).toHaveLength(0);
    // Same notice as the DLQ path.
    expect(await notifications()).toEqual([expect.objectContaining({ kind: 'capture_failed', title: 'Receipt scan failed' })]);
  });

  it('a markDone failure after the transaction was created neither re-runs the pipeline nor reports a failed capture', async () => {
    await seedPending();
    const db = failingOn(/SET status = 'done'/, 'D1_ERROR: down');
    const m = msg();
    await processIngestMessage(m, deps({ db, run: () => Promise.resolve({ transactionId: TX, created: true }) }));
    expect(m.acked).toBe(true);
    expect(m.retried).toBeUndefined();
    expect(await job()).toMatchObject({ status: 'processing', attempts: 1 });
    expect(await notifications()).toHaveLength(0);
  });

  it('a malformed queue message is acked and dropped', async () => {
    for (const body of [null, 'x', { job_id: 5 }, { job_id: 'a', kind: 'weird' }]) {
      const m = new FakeMessage(body);
      await processIngestMessage(m, deps());
      expect(m.acked).toBe(true);
    }
    expect(stub.calls).toHaveLength(0);
  });

  it('an unknown job id is acked', async () => {
    const m = msg(1, 'no-such-job');
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
  });

  it('a database error while claiming retries the message (the job is still pending)', async () => {
    await seedPending();
    const m = msg();
    await processIngestMessage(m, deps({ db: failingOn(/FROM jobs/, 'D1_ERROR: down') }));
    expect(m.acked).toBe(false);
    expect(m.retried).toEqual({ delaySeconds: 10 });
    expect(await job()).toMatchObject({ status: 'pending', attempts: 0 });
  });
});

describe('processIngestMessage: failures', () => {
  it('transient upstream error: release to pending and retry with backoff (no failure, no notification)', async () => {
    await seedPending();
    stub.on('POST', '/chat/completions', () => json({ error: 'overloaded' }, { status: 503 }));
    const m = msg();
    await processIngestMessage(m, deps());

    expect(m.acked).toBe(false);
    expect(m.retried).toEqual({ delaySeconds: 5 });
    const row = await job();
    expect(row).toMatchObject({ status: 'pending', attempts: 1 });
    // Backdated one second so the sweep (300 s) does not race the queue redelivery.
    expect(Date.now() - Date.parse(row?.updated_at ?? '')).toBeGreaterThanOrEqual(1000);
    expect(await notifications()).toHaveLength(0);
  });

  it('backoff grows with the attempt number', async () => {
    await seedPending({ attempts: 1 }); // claimed as attempt 2
    stub.on('POST', '/chat/completions', () => json({}, { status: 429 }));
    const m = msg(2);
    await processIngestMessage(m, deps());
    expect(m.retried).toEqual({ delaySeconds: 10 });
    expect(await job()).toMatchObject({ status: 'pending', attempts: 2 });
  });

  it('the final attempt fails the job for good even when the error is transient, and notifies', async () => {
    await seedPending({ attempts: 2 }); // claim makes it attempt 3
    stub.on('POST', '/chat/completions', () => json({}, { status: 503 }));
    const m = msg(3);
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(m.retried).toBeUndefined();
    expect(await job()).toMatchObject({ status: 'failed', last_error: 'TransientAiError: AI_PARSE_UNAVAILABLE' });
    expect(await notifications()).toHaveLength(1);
  });

  it('permanent error: failed (last_error <= 500 chars) + capture_failed notification for a receipt, then ack', async () => {
    await seedPending();
    stub.on('POST', '/chat/completions', () => json(completion('this is not json')));
    const m = msg();
    await processIngestMessage(m, deps());

    expect(m.acked).toBe(true);
    const failed = await job();
    expect(failed?.status).toBe('failed');
    expect((failed?.last_error ?? '').length).toBeLessThanOrEqual(500);
    expect(failed?.last_error).toContain('AI_PARSE_UNAVAILABLE');
    const today = new Date().toISOString().slice(0, 10);
    expect(await notifications()).toEqual([
      expect.objectContaining({
        kind: 'capture_failed',
        title: 'Receipt scan failed',
        body: "We couldn't read this receipt. Try again or add manually.",
        dedupe_key: `capture_failed:scan:${today}`,
        action_type: 'manual_add',
      }),
    ]);
  });

  it('a second failure on the same day does not notify again (deduped per day)', async () => {
    await seedPending();
    await seedPending({ id: JOB2 });
    stub.on('POST', '/chat/completions', () => json(completion('this is not json')));
    await processIngestMessage(msg(), deps());
    await processIngestMessage(msg(1, JOB2), deps());
    expect(await notifications()).toHaveLength(1);
  });

  it('receipt failures notify with source scan; voice failures send nothing', async () => {
    const run = async (kind: 'receipt' | 'voice') => {
      await testDb().prepare('DELETE FROM jobs').run();
      await testDb().prepare('DELETE FROM notifications').run();
      await seedJob({ id: JOB, kind, payload: mediaPayload(), attempts: 2 });
      // A missing object is an upstream (transient) problem; exhaust the attempts to reach the failure path.
      const m = new FakeMessage({ job_id: JOB, kind }, 3);
      await processIngestMessage(m, deps());
      expect(m.acked).toBe(true);
      expect(await job()).toMatchObject({ status: 'failed' });
      return notifications();
    };
    const scan = await run('receipt');
    expect(scan).toEqual([expect.objectContaining({ kind: 'capture_failed', title: 'Receipt scan failed', dedupe_key: expect.stringContaining('capture_failed:scan:') as string })]);
    expect(await run('voice')).toEqual([]);
  });

  it('respects capture_failed_alerts_enabled=false and survives a notification error', async () => {
    await seedSettings({ capture_failed_alerts_enabled: 0 });
    await seedPending();
    stub.on('POST', '/chat/completions', () => json({ error: 'bad' }, { status: 400 }));
    const m = msg();
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(await notifications()).toHaveLength(0);

    await testDb().prepare('DELETE FROM jobs').run();
    await seedPending();
    const m2 = msg();
    await processIngestMessage(m2, deps({ db: failingOn(/user_settings/, 'D1_ERROR: down') }));
    expect(m2.acked).toBe(true);
    expect(await job()).toMatchObject({ status: 'failed' });
  });

  it('classifies errors', () => {
    expect(isTransientError(new TransientAiError('x'))).toBe(true);
    expect(isTransientError(new UpstreamError('x'))).toBe(true);
    expect(isTransientError(new InvalidJobError('x'))).toBe(false);
    expect(isTransientError(new Error('TypeError: fetch failed'))).toBe(true);
    expect(isTransientError(new Error('D1_ERROR: Network connection lost.'))).toBe(true);
    expect(isTransientError(new Error('D1 DB is overloaded. Requests queued for too long.'))).toBe(true);
    expect(isTransientError(new Error('D1_ERROR: UNIQUE constraint failed: jobs.user_id, jobs.idempotency_key'))).toBe(false);
    expect(isTransientError(new Error('D1_ERROR: no such table: jobs'))).toBe(false);
    expect(isTransientError(new DOMException('t', 'TimeoutError'))).toBe(true);
    expect(isTransientError(new Error('boom'))).toBe(false);
  });

  it('injectable runner: a thrown permanent error fails, a thrown transient error retries', async () => {
    await seedPending();
    const bad = msg();
    await processIngestMessage(bad, deps({ run: () => Promise.reject(new Error('nope')) }));
    expect(bad.acked).toBe(true);

    await testDb().prepare('DELETE FROM jobs').run();
    await seedPending();
    const slow = msg();
    await processIngestMessage(slow, deps({ run: () => Promise.reject(new TransientAiError('later')) }));
    expect(slow.retried).toEqual({ delaySeconds: 5 });
  });
});

describe('queue handlers', () => {
  it('handleIngestBatch processes every message of the batch', async () => {
    await seedFood();
    await seedPending();
    stubDeepSeek(parsedSms());
    const messages = [msg(), msg(), msg()];
    await handleIngestBatch(fakeBatch('dime-ingest', messages), { ...env(), AI: fakeAi.asAi() });
    expect(messages.every((m) => m.acked)).toBe(true);
    expect(await transactions()).toHaveLength(1);
    // Three messages through the whole pipeline: the 5 s default times out when the full suite loads the machine.
  }, 20_000);

  it('one crashing message does not take the others down', async () => {
    await seedPending();
    const messages = [msg(), msg()];
    await handleIngestBatch(fakeBatch('dime-ingest', messages), { ...env(), DB: failingOn(/FROM jobs/, 'D1_ERROR: down') });
    expect(messages.map((m) => m.retried)).toEqual([{ delaySeconds: 10 }, { delaySeconds: 10 }]);
  });

  it('index.queue routes by queue name and stubs the email queue', async () => {
    await seedPending({ status: 'done' });
    const ctx = {} as ExecutionContext;
    const ingest = msg();
    await worker.queue?.(fakeBatch('dime-ingest', [ingest]), env(), ctx);
    expect(ingest.acked).toBe(true);
    expect(await job()).toMatchObject({ status: 'done', attempts: 0 }); // the ingest handler looked, found it finished

    await testDb().prepare("UPDATE jobs SET status = 'pending'").run();
    const dlq = msg();
    await worker.queue?.(fakeBatch('dime-ingest-dlq', [dlq]), env(), ctx);
    expect(dlq.acked).toBe(true);
    expect(await job()).toMatchObject({ status: 'failed', attempts: 0 }); // the DLQ handler, not the ingest one (which would have claimed it)

    const email = msg();
    await worker.queue?.(fakeBatch('dime-email', [email]), env(), ctx);
    expect(email.acked).toBe(true);
  });
});

describe('DLQ handler', () => {
  it('fails an unfinished job conditionally, notifies, and acks (idempotent)', async () => {
    await seedJob({ id: JOB, kind: 'receipt', payload: mediaPayload(), status: 'processing' });
    const m = new FakeMessage({ job_id: JOB, kind: 'receipt' });
    await handleIngestDlq(fakeBatch('dime-ingest-dlq', [m]), env());

    expect(m.acked).toBe(true);
    expect(await job()).toMatchObject({ status: 'failed', last_error: expect.stringContaining('Dead-lettered') as string });
    expect(await notifications()).toEqual([expect.objectContaining({ kind: 'capture_failed', title: 'Receipt scan failed' })]);
    // A redelivery is harmless: no second notification.
    await handleIngestDlq(fakeBatch('dime-ingest-dlq', [new FakeMessage({ job_id: JOB, kind: 'receipt' })]), env());
    expect(await notifications()).toHaveLength(1);
  });

  it('a job that already finished is left alone: no notification, still acked', async () => {
    await seedPending({ status: 'done', result: { transaction_id: TX } });
    const m = msg();
    await handleIngestDlq(fakeBatch('dime-ingest-dlq', [m]), env());
    expect(m.acked).toBe(true);
    expect(await job()).toMatchObject({ status: 'done', last_error: null });
    expect(await notifications()).toHaveLength(0);
  });

  it('acks malformed messages and retries when the database is down', async () => {
    const bad = new FakeMessage({ nope: 1 });
    await handleIngestDlq(fakeBatch('dime-ingest-dlq', [bad]), env());
    expect(bad.acked).toBe(true);

    const m = msg();
    await handleIngestDlq(fakeBatch('dime-ingest-dlq', [m]), { ...env(), DB: failingOn(/UPDATE jobs/, 'D1_ERROR: down') });
    expect(m.acked).toBe(false);
    expect(m.retried).toEqual({ delaySeconds: 30 });
  });
});

const controller = (cron: string) => ({ cron, scheduledTime: Date.now(), type: 'scheduled', noRetry: () => undefined }) as ScheduledController;

describe('recovery sweep', () => {
  const NOW = Date.parse('2026-10-04T12:00:00.000Z');
  const STALE = '2026-10-04T11:54:00.000Z'; // 6 minutes: stale (the cutoff is 300 s)
  const FRESH = '2026-10-04T11:59:30.000Z'; // 30 seconds: not yet
  const id = (n: number) => `bbbbbbbb-0000-0000-0000-${String(n).padStart(12, '0')}`;

  it('re-sends stale pending jobs and re-queues stale processing ones, oldest first, per kind', async () => {
    await seedJob({ id: id(2), kind: 'receipt', status: 'pending', updated_at: '2026-10-04T11:54:30.000Z' });
    await seedJob({ id: id(1), kind: 'receipt', status: 'pending', updated_at: '2026-10-04T11:50:00.000Z' });
    await seedJob({ id: id(3), kind: 'receipt', status: 'processing', updated_at: STALE });
    await seedJob({ id: id(4), kind: 'receipt', status: 'pending', updated_at: FRESH }); // too fresh
    await seedJob({ id: id(5), kind: 'receipt', status: 'done', updated_at: STALE }); // finished
    await seedJob({ id: id(6), kind: 'voice', status: 'processing', updated_at: STALE });
    const queue = new FakeQueue();
    const out = await sweepJobs(testDb(), queue.asQueue(), NOW);

    // Per kind: the pending jobs oldest first, then the processing ones that were released.
    expect(queue.sent).toEqual([
      { job_id: id(1), kind: 'receipt' },
      { job_id: id(2), kind: 'receipt' },
      { job_id: id(3), kind: 'receipt' },
      { job_id: id(6), kind: 'voice' },
    ]);
    expect(out).toEqual({ requeued: 2, resent: 4 });
    expect(await oneRow('jobs', 'id = ?', id(3))).toMatchObject({ status: 'pending' });
    expect(await oneRow('jobs', 'id = ?', id(4))).toMatchObject({ status: 'pending', updated_at: FRESH });
    expect(await oneRow('jobs', 'id = ?', id(5))).toMatchObject({ status: 'done' });
  });

  it('requeues a stale processing job (conditional update) and leaves a freshly touched one alone', async () => {
    await seedJob({ id: id(3), kind: 'receipt', status: 'processing', updated_at: STALE });
    await seedJob({ id: id(6), kind: 'voice', status: 'processing', updated_at: STALE });
    // The voice job is touched by its worker right before the sweep's conditional requeue.
    let touched = false;
    const db = withBeforeExec(/UPDATE jobs SET status = 'pending', updated_at = \? WHERE id = \? AND status = 'processing'/, async () => {
      if (touched) return;
      touched = true;
      await testDb().prepare('UPDATE jobs SET updated_at = ? WHERE id = ?').bind(new Date(NOW - 1000).toISOString(), id(6)).run();
    });
    const queue = new FakeQueue();
    const out = await sweepJobs(db, queue.asQueue(), NOW);
    // Kinds run receipt, voice: the hook fires first for the receipt job (touching the voice job), so only the receipt job is requeued.
    expect(queue.sent).toEqual([{ job_id: id(3), kind: 'receipt' }]);
    expect(out).toEqual({ requeued: 1, resent: 1 });
    expect(await oneRow('jobs', 'id = ?', id(3))).toMatchObject({ status: 'pending' });
    expect(await oneRow('jobs', 'id = ?', id(6))).toMatchObject({ status: 'processing' });
  });

  it('sends oldest first within a kind and respects the 300 s cutoff', async () => {
    await seedJob({ id: id(2), kind: 'voice', status: 'pending', updated_at: '2026-10-04T11:54:30.000Z' });
    await seedJob({ id: id(1), kind: 'voice', status: 'pending', updated_at: '2026-10-04T11:50:00.000Z' });
    await seedJob({ id: id(3), kind: 'voice', status: 'pending', updated_at: '2026-10-04T11:57:00.000Z' }); // 3 minutes: not yet
    await seedJob({ id: id(4), kind: 'voice', status: 'pending', updated_at: FRESH });
    await seedJob({ id: id(5), kind: 'voice', status: 'failed', updated_at: STALE });
    const queue = new FakeQueue();
    const out = await sweepJobs(testDb(), queue.asQueue(), NOW);
    expect(queue.sent).toEqual([
      { job_id: id(1), kind: 'voice' },
      { job_id: id(2), kind: 'voice' },
    ]);
    expect(out).toEqual({ requeued: 0, resent: 2 });
  });

  it('does nothing (and sends nothing) when no job is stale', async () => {
    await seedJob({ kind: 'voice', status: 'pending', updated_at: FRESH });
    const queue = new FakeQueue();
    expect(await sweepJobs(testDb(), queue.asQueue(), NOW)).toEqual({ requeued: 0, resent: 0 });
    expect(queue.sent).toEqual([]);
  });

  it('a queue failure is not fatal: the jobs stay pending for the next sweep', async () => {
    await seedJob({ id: id(1), kind: 'voice', status: 'pending', updated_at: STALE });
    const queue = new FakeQueue();
    queue.failWith = new Error('down');
    expect(await sweepJobs(testDb(), queue.asQueue(), NOW)).toEqual({ requeued: 0, resent: 0 });
    expect(await oneRow('jobs', 'id = ?', id(1))).toMatchObject({ status: 'pending' });
  });

  it('sends everything it found in one batch of at most 100', async () => {
    const db = testDb();
    const insert = db.prepare("INSERT INTO jobs (id, user_id, kind, payload, status, attempts, created_at, updated_at) VALUES (?, ?, ?, '{}', 'pending', 0, ?, ?)");
    const rows = (['receipt', 'voice'] as const).flatMap((kind, k) => Array.from({ length: 50 }, (_, i) => insert.bind(id(k * 100 + i), USER_ID, kind, STALE, STALE)));
    for (let i = 0; i < rows.length; i += 50) await db.batch(rows.slice(i, i + 50));
    const queue = new FakeQueue();
    const batches: number[] = [];
    queue.sendBatch = (messages) => {
      const list = [...messages];
      batches.push(list.length);
      queue.sent.push(...list.map((m) => m.body));
      return Promise.resolve();
    };
    await sweepJobs(db, queue.asQueue(), NOW);
    expect(batches).toEqual([100]); // 2 kinds x 50 stale jobs, one full batch
  });

  it('scheduled() dispatches by cron: the sweep for */5, a stub for the email digest', async () => {
    await seedJob({ kind: 'voice', status: 'pending', updated_at: STALE });
    const queue = new FakeQueue();
    const e = { ...env(), INGEST_QUEUE: queue.asQueue() } as Bindings;
    const ctx = {} as ExecutionContext;
    await worker.scheduled?.(controller('*/5 * * * *'), e, ctx);
    expect(queue.sent.length).toBeGreaterThan(0);

    const before = queue.sent.length;
    await worker.scheduled?.(controller('30 2 * * *'), e, ctx);
    await worker.scheduled?.(controller('1 1 1 1 1'), e, ctx);
    expect(queue.sent.length).toBe(before);
  });
});
