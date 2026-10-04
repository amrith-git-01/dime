import { describe, expect, it } from 'vitest';

import type { Bindings } from '../src/core/env';
import { createServiceClient } from '../src/core/supabase';
import { isPurgeSlot, purgeOldJobs } from '../src/features/jobs/purge';
import worker from '../src/index';
import { makeEnv } from './helpers';
import { FakeQueue } from './ingest-fixtures';
import { pgError, rows, useSupabaseStub } from './supabase-stub';

const stub = useSupabaseStub();

const NOW = Date.parse('2026-10-04T12:00:00.000Z');
const DAY = 86_400_000;
const db = () => createServiceClient(makeEnv());
const ids = (n: number, prefix = 'j') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));

describe('isPurgeSlot', () => {
  it('is true only for the first 5-minute run of each hour', () => {
    const at = (minute: number) => Date.parse(`2026-10-04T12:${String(minute).padStart(2, '0')}:00Z`);
    expect([0, 5, 10, 30, 55].map((m) => isPurgeSlot(at(m)))).toEqual([true, false, false, false, false]);
  });
});

describe('purgeOldJobs', () => {
  it('deletes finished jobs older than 30 days and manual_create rows older than 7 days', async () => {
    stub.on('GET', '/rest/v1/jobs', (c) => rows(c.params.get('kind') === 'eq.manual_create' ? ids(2, 'm') : ids(3, 'f')));
    stub.on('DELETE', '/rest/v1/jobs', () => rows([]));

    expect(await purgeOldJobs(db(), NOW)).toBe(5);

    const [finished, manual] = stub.find('GET', '/rest/v1/jobs');
    expect(finished?.params.get('status')).toBe('in.(done,failed)');
    expect(finished?.params.get('updated_at')).toBe(`lt.${new Date(NOW - 30 * DAY).toISOString()}`);
    expect(finished?.params.get('kind')).toBeNull();
    expect(finished?.params.get('limit')).toBe('100');
    expect(manual?.params.get('kind')).toBe('eq.manual_create');
    expect(manual?.params.get('status')).toBeNull();
    expect(manual?.params.get('updated_at')).toBe(`lt.${new Date(NOW - 7 * DAY).toISOString()}`);

    const deletes = stub.find('DELETE', '/rest/v1/jobs');
    expect(deletes.map((d) => d.params.get('id'))).toEqual(['in.(f0,f1,f2)', 'in.(m0,m1)']);
  });

  it('issues no delete when nothing is old enough', async () => {
    stub.on('GET', '/rest/v1/jobs', () => rows([]));
    expect(await purgeOldJobs(db(), NOW)).toBe(0);
    expect(stub.find('DELETE', '/rest/v1/jobs')).toHaveLength(0);
  });

  it('works in batches of 100 and keeps going while batches come back full', async () => {
    let finishedCalls = 0;
    stub.on('GET', '/rest/v1/jobs', (c) => {
      if (c.params.get('kind') === 'eq.manual_create') return rows([]);
      finishedCalls += 1;
      return rows(finishedCalls < 3 ? ids(100) : ids(40));
    });
    stub.on('DELETE', '/rest/v1/jobs', () => rows([]));

    expect(await purgeOldJobs(db(), NOW)).toBe(240);
    expect(stub.find('DELETE', '/rest/v1/jobs')).toHaveLength(3);
  });

  it('caps the work per run when the backlog is large', async () => {
    stub.on('GET', '/rest/v1/jobs', (c) => rows(c.params.get('kind') === 'eq.manual_create' ? [] : ids(100)));
    stub.on('DELETE', '/rest/v1/jobs', () => rows([]));
    expect(await purgeOldJobs(db(), NOW)).toBe(1000);
    expect(stub.find('GET', '/rest/v1/jobs').filter((c) => c.params.get('kind') === null)).toHaveLength(10);
  });

  it('never throws: a database error ends the purge and is retried next hour', async () => {
    stub.on('GET', '/rest/v1/jobs', () => pgError('XX000', 'down', 500));
    expect(await purgeOldJobs(db(), NOW)).toBe(0);
  });
});

describe('scheduled sweep purge', () => {
  const controller = (scheduledTime: number) =>
    ({ cron: '*/5 * * * *', scheduledTime, type: 'scheduled', noRetry: () => undefined }) as ScheduledController;
  const env = () => ({ ...makeEnv(), INGEST_QUEUE: new FakeQueue().asQueue() }) as unknown as Bindings;

  function stubJobsTable(): void {
    // Recovery lists (status in pending/processing) find nothing; the purge selects find one old row.
    stub.on('GET', '/rest/v1/jobs', (c) => rows(c.params.get('status') === 'in.(pending,processing)' ? [] : ids(1)));
    stub.on('DELETE', '/rest/v1/jobs', () => rows([]));
  }

  it('purges on the first run of the hour', async () => {
    stubJobsTable();
    await worker.scheduled?.(controller(Date.parse('2026-10-04T12:00:00Z')), env(), {} as ExecutionContext);
    expect(stub.find('DELETE', '/rest/v1/jobs').length).toBeGreaterThan(0);
  });

  it('only recovers on the other runs of the hour', async () => {
    stubJobsTable();
    await worker.scheduled?.(controller(Date.parse('2026-10-04T12:05:00Z')), env(), {} as ExecutionContext);
    expect(stub.find('DELETE', '/rest/v1/jobs')).toHaveLength(0);
  });
});
