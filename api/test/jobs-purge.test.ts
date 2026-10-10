import { describe, expect, it } from 'vitest';

import type { Bindings } from '../src/core/env';
import { isPurgeSlot, purgeOldJobs } from '../src/features/jobs/purge';
import worker from '../src/index';
import { makeEnv } from './helpers';
import { oneRow, rowsOf, seedJob, testDb, uid, USER_ID } from './db';
import { FakeQueue } from './ingest-fixtures';

const NOW = Date.parse('2026-10-04T12:00:00.000Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

/** Insert many job rows in one batch. */
async function seedMany(n: number, over: { status: string; kind?: string; updated_at: string }) {
  const db = testDb();
  const stmt = db.prepare(
    "INSERT INTO jobs (id, user_id, kind, payload, status, attempts, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, 0, ?, ?)",
  );
  const batch = Array.from({ length: n }, () => stmt.bind(uid(), USER_ID, over.kind ?? 'sms', over.status, over.updated_at, over.updated_at));
  for (let i = 0; i < batch.length; i += 100) await db.batch(batch.slice(i, i + 100));
}

describe('isPurgeSlot', () => {
  it('is true only for the first 5-minute run of each hour', () => {
    const at = (minute: number) => Date.parse(`2026-10-04T12:${String(minute).padStart(2, '0')}:00Z`);
    expect([0, 5, 10, 30, 55].map((m) => isPurgeSlot(at(m)))).toEqual([true, false, false, false, false]);
  });
});

describe('purgeOldJobs', () => {
  it('deletes finished jobs older than 30 days and manual_create rows older than 7 days', async () => {
    const oldDone = await seedJob({ status: 'done', updated_at: ago(31) });
    const oldFailed = await seedJob({ status: 'failed', updated_at: ago(40) });
    const recentDone = await seedJob({ status: 'done', updated_at: ago(29) });
    const oldPending = await seedJob({ status: 'pending', updated_at: ago(60) });
    const oldManual = await seedJob({ kind: 'manual_create', status: 'done', updated_at: ago(8) });
    const recentManual = await seedJob({ kind: 'manual_create', status: 'processing', updated_at: ago(6) });

    expect(await purgeOldJobs(testDb(), NOW)).toBe(3);

    const left = (await rowsOf<{ id: string }>('jobs')).map((r) => r.id).sort();
    expect(left).toEqual([recentDone, oldPending, recentManual].sort());
    expect([oldDone, oldFailed, oldManual].every((id) => !left.includes(id))).toBe(true);
  });

  it('deletes nothing when nothing is old enough', async () => {
    await seedJob({ status: 'done', updated_at: ago(1) });
    expect(await purgeOldJobs(testDb(), NOW)).toBe(0);
    expect(await rowsOf('jobs')).toHaveLength(1);
  });

  it('works in batches of 100 and keeps going while batches come back full', async () => {
    await seedMany(240, { status: 'done', updated_at: ago(45) });
    expect(await purgeOldJobs(testDb(), NOW)).toBe(240);
    expect(await rowsOf('jobs')).toHaveLength(0);
  });

  it('caps the work per run when the backlog is large', async () => {
    await seedMany(1100, { status: 'failed', updated_at: ago(45) });
    expect(await purgeOldJobs(testDb(), NOW)).toBe(1000);
    expect(await rowsOf('jobs')).toHaveLength(100);
  });

  it('never throws: a database error ends the purge and is retried next hour', async () => {
    const broken = {
      prepare: () => {
        throw new Error('down');
      },
    } as unknown as D1Database;
    expect(await purgeOldJobs(broken, NOW)).toBe(0);
  });
});

describe('scheduled sweep purge', () => {
  const controller = (scheduledTime: number) =>
    ({ cron: '*/5 * * * *', scheduledTime, type: 'scheduled', noRetry: () => undefined }) as ScheduledController;
  const env = () => ({ ...makeEnv(), INGEST_QUEUE: new FakeQueue().asQueue() }) as unknown as Bindings;

  it('purges on the first run of the hour', async () => {
    const id = await seedJob({ status: 'done', updated_at: ago(45) });
    await worker.scheduled?.(controller(Date.parse('2026-10-04T12:00:00Z')), env(), {} as ExecutionContext);
    expect(await oneRow('jobs', 'id = ?', id)).toBeNull();
  });

  it('only recovers on the other runs of the hour', async () => {
    const id = await seedJob({ status: 'done', updated_at: ago(45) });
    await worker.scheduled?.(controller(Date.parse('2026-10-04T12:05:00Z')), env(), {} as ExecutionContext);
    expect(await oneRow('jobs', 'id = ?', id)).not.toBeNull();
  });
});
