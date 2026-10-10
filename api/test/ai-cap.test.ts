import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';

import { getConfig } from '../src/core/env';
import type { Bindings } from '../src/core/env';
import { PermanentAiError } from '../src/features/ai/errors';
import {
  addNeurons,
  addUserCapture,
  assertJobAllowed,
  assertUploadAllowed,
  estimateCaptureNeurons,
  estimateOcrNeurons,
  estimateWhisperNeurons,
  neuronsFromTokens,
  neuronsUsedToday,
  secondsUntilUtcMidnight,
  userCapturesToday,
  utcDay,
} from '../src/features/ai/neuron-cap';
import { processIngestMessage } from '../src/features/ingest/consumer';
import type { IngestDeps } from '../src/features/ingest/consumer';
import { mediaStore } from '../src/features/media/storage';
import { USER_ID, call, makeEnv } from './helpers';
import { oneRow, rowsOf, seedCategory, seedJob, testDb } from './db';
import { CAT_FOOD, FakeAi, FakeMessage, FakeQueue, JOB, JPEG, M4A, TZ, completion, mediaPayload, parsedSms, smsPayload, uploadForm } from './ingest-fixtures';
import { json, useSupabaseStub } from './supabase-stub';

const stub = useSupabaseStub();
const fakeAi = new FakeAi();
beforeEach(() => {
  fakeAi.calls.length = 0;
  fakeAi.respond = new FakeAi().respond;
});

const db = () => testDb();
const LIMITS = { dailyNeuronCap: 1000, userDailyCaptures: 3 };
const NOON = Date.UTC(2026, 9, 10, 12, 0, 0);

describe('estimates', () => {
  it('whisper: 46.63 neurons per audio minute, minutes rounded up from an assumed 32 kbps (240 KB per minute)', () => {
    expect(estimateWhisperNeurons(1)).toBe(47);
    expect(estimateWhisperNeurons(240_000)).toBe(47);
    expect(estimateWhisperNeurons(240_001)).toBe(94); // 2 minutes = 93.26 -> 94
    expect(estimateCaptureNeurons('voice', 15 * 1024 * 1024)).toBe(Math.ceil(66 * 46.63));
  });

  it('llama-4-scout: $0.27/M input and $0.85/M output tokens = 24,545 and 77,273 neurons per M', () => {
    expect(neuronsFromTokens(1_000_000, 0)).toBe(24_545);
    expect(neuronsFromTokens(0, 1_000_000)).toBe(77_273);
    // 1600 image + 400 prompt tokens in, all 2048 tokens out.
    expect(estimateOcrNeurons()).toBe(Math.ceil((2000 * 24_545 + 2048 * 77_273) / 1_000_000));
    expect(estimateCaptureNeurons('receipt', 123)).toBe(estimateOcrNeurons());
  });
});

describe('counters', () => {
  it('addNeurons accumulates within a UTC day and starts a new row on the next day', async () => {
    await addNeurons(db(), NOON, 100);
    await addNeurons(db(), NOON + 1000, 50.2); // rounds up
    expect(await neuronsUsedToday(db(), NOON)).toBe(151);
    expect(await neuronsUsedToday(db(), NOON + 24 * 3600 * 1000)).toBe(0);
    await addNeurons(db(), NOON + 24 * 3600 * 1000, 7);
    expect(await neuronsUsedToday(db(), NOON)).toBe(151);
    expect(await neuronsUsedToday(db(), NOON + 24 * 3600 * 1000)).toBe(7);
    expect(await rowsOf('ai_usage')).toHaveLength(2);
    await addNeurons(db(), NOON, 0);
    expect(await neuronsUsedToday(db(), NOON)).toBe(151);
  });

  it('the day flips exactly at 00:00 UTC', async () => {
    const lastMs = Date.UTC(2026, 9, 10, 23, 59, 59, 999);
    await addNeurons(db(), lastMs, 10);
    expect(utcDay(lastMs)).toBe('2026-10-10');
    expect(await neuronsUsedToday(db(), lastMs + 1)).toBe(0);
    expect(secondsUntilUtcMidnight(lastMs)).toBe(1);
    expect(secondsUntilUtcMidnight(NOON)).toBe(12 * 3600);
  });

  it('user captures count per user and day', async () => {
    await addUserCapture(db(), USER_ID, NOON);
    await addUserCapture(db(), USER_ID, NOON);
    expect(await userCapturesToday(db(), USER_ID, NOON)).toBe(2);
    expect(await userCapturesToday(db(), USER_ID, NOON + 24 * 3600 * 1000)).toBe(0);
  });
});

describe('guards', () => {
  it('upload: allowed while used + estimate <= cap, 429 with Retry-After beyond it', async () => {
    await addNeurons(db(), NOON, 900);
    await assertUploadAllowed(db(), USER_ID, LIMITS, 100, NOON); // exactly at the cap
    const err = await assertUploadAllowed(db(), USER_ID, LIMITS, 101, NOON).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 429, message: 'Scanning is paused for today. Try again tomorrow.', headers: { 'Retry-After': String(12 * 3600) } });
    // The next UTC day starts empty.
    await assertUploadAllowed(db(), USER_ID, LIMITS, 101, NOON + 12 * 3600 * 1000);
  });

  it('upload: the per-user daily capture limit', async () => {
    for (let i = 0; i < 3; i++) await addUserCapture(db(), USER_ID, NOON);
    const err = await assertUploadAllowed(db(), USER_ID, LIMITS, 1, NOON).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 429, message: "You've reached today's limit of 3 scans and voice notes. Try again tomorrow." });
  });

  it('job: a permanent AI error once the day is used up', async () => {
    await addNeurons(db(), Date.now(), 950);
    await assertJobAllowed(db(), LIMITS, 50);
    await expect(assertJobAllowed(db(), LIMITS, 51)).rejects.toBeInstanceOf(PermanentAiError);
  });
});

describe('POST /transactions/receipt|voice over the cap', () => {
  const ingestEnv = (queue: FakeQueue, extra: Record<string, string> = {}): Bindings =>
    ({ ...makeEnv(extra), INGEST_QUEUE: queue.asQueue(), WRITE_LIMITER: undefined, AI_LIMITER: undefined }) as unknown as Bindings;
  const storedKeys = async () => (await workerEnv.MEDIA.list()).objects.map((o) => o.key);

  it.each([
    ['receipt', JPEG],
    ['voice', M4A],
  ] as const)('%s: 429 with the API error body and Retry-After; nothing stored, saved or queued', async (kind, bytes) => {
    await addNeurons(db(), Date.now(), 7990);
    const queue = new FakeQueue();
    const res = await call(`/api/v1/transactions/${kind}?${TZ}`, { method: 'POST', body: uploadForm(bytes), env: ingestEnv(queue) });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ detail: 'Scanning is paused for today. Try again tomorrow.' });
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(24 * 3600);
    expect(await storedKeys()).toEqual([]);
    expect(await rowsOf('jobs')).toHaveLength(0);
    expect(queue.sent).toEqual([]);
    expect(await userCapturesToday(db(), USER_ID, Date.now())).toBe(0);
  });

  it('under the cap the upload is accepted and counted against the user', async () => {
    const queue = new FakeQueue();
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, { method: 'POST', body: uploadForm(JPEG), env: ingestEnv(queue) });
    expect(res.status).toBe(202);
    expect(queue.sent).toHaveLength(1);
    expect(await userCapturesToday(db(), USER_ID, Date.now())).toBe(1);
  });

  it('the AI_DAILY_NEURON_CAP var is honoured', async () => {
    const res = await call(`/api/v1/transactions/receipt?${TZ}`, {
      method: 'POST',
      body: uploadForm(JPEG),
      env: ingestEnv(new FakeQueue(), { AI_DAILY_NEURON_CAP: '10' }),
    });
    expect(res.status).toBe(429);
  });

  it('the per-user limit answers 429 with its own message', async () => {
    for (let i = 0; i < 2; i++) await addUserCapture(db(), USER_ID, Date.now());
    const queue = new FakeQueue();
    const env = ingestEnv(queue, { AI_USER_DAILY_CAPTURES: '2' });
    const res = await call(`/api/v1/transactions/voice?${TZ}`, { method: 'POST', body: uploadForm(M4A), env });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ detail: expect.stringContaining('limit of 2') as string });
    expect(queue.sent).toEqual([]);
  });

  it('SMS (DeepSeek) is neither blocked by nor counted against the cap', async () => {
    await addNeurons(db(), Date.now(), 100_000);
    const queue = new FakeQueue();
    const res = await call(`/api/v1/transactions/sms?${TZ}`, {
      method: 'POST',
      json: { messages: [{ body: 'INR 5 debited', received_at: '2026-10-04T10:00:00+00:00' }] },
      env: ingestEnv(queue),
    });
    expect(res.status).toBe(202);
    expect(queue.sent).toHaveLength(1);
    expect(await userCapturesToday(db(), USER_ID, Date.now())).toBe(0);
    expect(await neuronsUsedToday(db(), Date.now())).toBe(100_000);
  });
});

describe('ingest consumer and the cap', () => {
  const env = (): Bindings => makeEnv({ DEEPSEEK_API_KEY: 'ds-key' });
  const deps = (): IngestDeps => ({ db: testDb(), storage: mediaStore(env()), config: getConfig(env()), ai: fakeAi.asAi() });
  const seedFood = () => seedCategory({ id: CAT_FOOD, name: 'Food', icon_name: 'Utensils', color: '#111111' });
  const job = () => oneRow<{ status: string; last_error: string | null }>('jobs', 'id = ?', JOB);

  it('receipt over the cap: fails permanently with the capture-failed notification, AI never called', async () => {
    await addNeurons(db(), Date.now(), 7990);
    await seedJob({ id: JOB, kind: 'receipt', payload: mediaPayload() });
    await workerEnv.MEDIA.put(mediaPayload().object_path, JPEG, { httpMetadata: { contentType: 'image/jpeg' } });
    const m = new FakeMessage({ job_id: JOB, kind: 'receipt' });
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(m.retried).toBeUndefined();
    expect(await job()).toMatchObject({ status: 'failed', last_error: 'PermanentAiError: Daily AI limit reached.' });
    expect(fakeAi.calls).toHaveLength(0);
    expect(await rowsOf('notifications')).toHaveLength(1);
  });

  it('voice over the cap fails permanently without calling the AI (and raises no notification)', async () => {
    await addNeurons(db(), Date.now(), 7990);
    const payload = mediaPayload({ object_path: `voice_inputs/${USER_ID}/voice_inputs/2026-10-04/1-abcd1234.m4a`, mime_type: 'audio/mp4' });
    await seedJob({ id: JOB, kind: 'voice', payload });
    await workerEnv.MEDIA.put(payload.object_path, M4A, { httpMetadata: { contentType: 'audio/mp4' } });
    const m = new FakeMessage({ job_id: JOB, kind: 'voice' });
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(await job()).toMatchObject({ status: 'failed' });
    expect(fakeAi.calls).toHaveLength(0);
    expect(await rowsOf('notifications')).toHaveLength(0);
  });

  it('a successful receipt and voice job book their neurons (actual usage, else estimate) into the global counter', async () => {
    await seedFood();
    stub.on('POST', '/chat/completions', () => json(completion(parsedSms())));
    const receipt = mediaPayload();
    await seedJob({ id: JOB, kind: 'receipt', payload: receipt });
    await workerEnv.MEDIA.put(receipt.object_path, JPEG, { httpMetadata: { contentType: 'image/jpeg' } });
    await processIngestMessage(new FakeMessage({ job_id: JOB, kind: 'receipt' }), deps());
    // Default fake answer: 1500 in + 100 out tokens = 36.8 + 7.7 = 44.5 -> 45.
    expect(await neuronsUsedToday(db(), Date.now())).toBe(45);

    const voice = mediaPayload({ object_path: `voice_inputs/${USER_ID}/voice_inputs/2026-10-04/2-abcd1234.m4a`, mime_type: 'audio/mp4' });
    const voiceJob = 'aaaaaaaa-0000-0000-0000-0000000000a2';
    await seedJob({ id: voiceJob, kind: 'voice', payload: voice });
    await workerEnv.MEDIA.put(voice.object_path, M4A, { httpMetadata: { contentType: 'audio/mp4' } });
    await processIngestMessage(new FakeMessage({ job_id: voiceJob, kind: 'voice' }), deps());
    expect(await neuronsUsedToday(db(), Date.now())).toBe(45 + 47);
    expect(await job()).toMatchObject({ status: 'done' });
  });

  it('a failed AI call books nothing', async () => {
    await seedFood();
    fakeAi.respond = () => {
      throw new Error('3040: Capacity temporarily exceeded');
    };
    const receipt = mediaPayload();
    await seedJob({ id: JOB, kind: 'receipt', payload: receipt });
    await workerEnv.MEDIA.put(receipt.object_path, JPEG, { httpMetadata: { contentType: 'image/jpeg' } });
    const m = new FakeMessage({ job_id: JOB, kind: 'receipt' });
    await processIngestMessage(m, deps());
    expect(m.retried).toBeDefined(); // transient: queue retry
    expect(await neuronsUsedToday(db(), Date.now())).toBe(0);
  });

  it('SMS jobs run at any usage: DeepSeek only, no Workers AI call, nothing booked', async () => {
    await seedFood();
    await addNeurons(db(), Date.now(), 1_000_000);
    await seedJob({ id: JOB, kind: 'sms', payload: smsPayload() });
    stub.on('POST', '/chat/completions', () => json(completion(parsedSms())));
    const m = new FakeMessage({ job_id: JOB, kind: 'sms' });
    await processIngestMessage(m, deps());
    expect(m.acked).toBe(true);
    expect(await job()).toMatchObject({ status: 'done' });
    expect(fakeAi.calls).toHaveLength(0);
    expect(await neuronsUsedToday(db(), Date.now())).toBe(1_000_000);
  });
});
