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
  const batch = Array.from({ length: n }, () => stmt.bind(uid(), USER_ID, over.kind ?? 'receipt', over.status, over.updated_at, over.updated_at));
  for (let i = 0; i < batch.length; i += 100) await db.batch(batch.slice(i, i + 100));
}

describe('isPurgeSlot', () => {
  it('is true only for the first 5-minute run of each hour', () => {
    const at = (minute: number) => Date.parse(`2026-10-04T12:${String(minute).padStart(2, '0')}:00Z`);
    expect([0, 5, 10, 30, 55].map((m) => isPurgeSlot(at(m)))).toEqual([true, false, false, false, false]);
  });
});

describe('purgeOldJobs', () => {
  it('deletes finished jobs older than 30 days and manual_create rows older than 30 days', async () => {
    const oldDone = await seedJob({ status: 'done', updated_at: ago(31) });
    const oldFailed = await seedJob({ status: 'failed', updated_at: ago(40) });
    const recentDone = await seedJob({ status: 'done', updated_at: ago(29) });
    const oldPending = await seedJob({ status: 'pending', updated_at: ago(60) });
    const oldManual = await seedJob({ kind: 'manual_create', status: 'done', updated_at: ago(31) });
    const recentManual = await seedJob({ kind: 'manual_create', status: 'processing', updated_at: ago(29) });

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

  it('also purges dead sessions, old usage counters and old soft-deleted notifications', async () => {
    const db = testDb();
    const session = (id: string, expires: string, revoked: string | null) =>
      db
        .prepare('INSERT INTO auth_sessions (id, user_id, refresh_hash, family_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, USER_ID, `hash-${id}`, 'fam', ago(100), expires, revoked)
        .run();
    await session('expired-old', ago(8), null);
    await session('revoked-old', ago(1), ago(8));
    await session('expired-recent', ago(6), null);
    await session('revoked-recent', ago(1), ago(6));
    await session('live', new Date(NOW + DAY).toISOString(), null);

    const day = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);
    await db.batch([
      db.prepare('INSERT INTO ai_usage (day, neurons) VALUES (?, 1)').bind(day(91)),
      db.prepare('INSERT INTO ai_usage (day, neurons) VALUES (?, 1)').bind(day(89)),
      db.prepare('INSERT INTO ai_user_usage (user_id, day, captures) VALUES (?, ?, 1)').bind(USER_ID, day(91)),
      db.prepare('INSERT INTO ai_user_usage (user_id, day, captures) VALUES (?, ?, 1)').bind(USER_ID, day(1)),
      db.prepare('INSERT INTO agent_usage (user_id, day, turns) VALUES (?, ?, 1)').bind(USER_ID, day(120)),
      db.prepare('INSERT INTO agent_usage (user_id, day, turns) VALUES (?, ?, 1)').bind(USER_ID, day(0)),
    ]);
    const note = (id: string, deletedAt: string | null) =>
      db
        .prepare("INSERT INTO notifications (id, user_id, kind, title, body, dedupe_key, deleted_at, created_at) VALUES (?, ?, 'capture_failed', 't', 'b', ?, ?, ?)")
        .bind(id, USER_ID, `k-${id}`, deletedAt, ago(100));
    await db.batch([note('gone', ago(31)), note('recent-delete', ago(29)), note('kept', null)]);

    expect(await purgeOldJobs(db, NOW)).toBe(2 + 1 + 1 + 1 + 1);
    expect((await rowsOf<{ id: string }>('auth_sessions')).map((r) => r.id).sort()).toEqual(['expired-recent', 'live', 'revoked-recent']);
    expect(await rowsOf('ai_usage')).toHaveLength(1);
    expect(await rowsOf('ai_user_usage')).toHaveLength(1);
    expect(await rowsOf('agent_usage')).toHaveLength(1);
    expect((await rowsOf<{ id: string }>('notifications')).map((r) => r.id).sort()).toEqual(['kept', 'recent-delete']);
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
