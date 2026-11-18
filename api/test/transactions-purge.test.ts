import { env as workerEnv } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { Bindings } from '../src/core/env';
import { mediaStore } from '../src/features/media/storage';
import { DELETED_RETENTION_DAYS, purgeDeletedTransactions } from '../src/features/transactions/purge';
import worker from '../src/index';
import { makeEnv } from './helpers';
import { rowsOf, seedReminder, seedReminderPayment, seedTransaction, testDb } from './db';
import { FakeQueue, JPEG, M4A } from './ingest-fixtures';

const NOW = Date.parse('2026-10-04T12:00:00.000Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const store = () => mediaStore(makeEnv());
const keys = async () => (await workerEnv.MEDIA.list()).objects.map((o) => o.key).sort();
const put = (key: string, bytes: Uint8Array) => workerEnv.MEDIA.put(key, bytes);

describe('purging soft-deleted transactions (R8)', () => {
  it('removes transactions deleted more than 30 days ago together with their receipt and voice objects; younger ones and live ones stay', async () => {
    await put('receipts/u/old.jpg', JPEG);
    await put('voice_inputs/u/old.m4a', M4A);
    await put('receipts/u/recent.jpg', JPEG);
    await put('receipts/u/live.jpg', JPEG);
    const old = await seedTransaction({ deleted_at: ago(DELETED_RETENTION_DAYS + 1), receipt_url: 'receipts/u/old.jpg', voice_url: 'voice_inputs/u/old.m4a' });
    const recent = await seedTransaction({ deleted_at: ago(DELETED_RETENTION_DAYS - 1), receipt_url: 'receipts/u/recent.jpg' });
    const live = await seedTransaction({ receipt_url: 'receipts/u/live.jpg' });

    expect(await purgeDeletedTransactions(testDb(), store(), NOW)).toBe(1);

    expect((await rowsOf<{ id: string }>('transactions')).map((r) => r.id).sort()).toEqual([recent, live].sort());
    expect(await keys()).toEqual(['receipts/u/live.jpg', 'receipts/u/recent.jpg']);
    expect(old).toBeTruthy();
  });

  it('takes the rows paybacks, reminder payments and notification links with them', async () => {
    const debit = await seedTransaction({ amount: '1000', deleted_at: ago(40) });
    const credit = await seedTransaction({ type: 'credit', amount: '1000' });
    await testDb()
      .prepare('INSERT INTO transaction_offsets (id, user_id, credit_id, debit_id, amount) VALUES (?, ?, ?, ?, ?)')
      .bind('00000000-0000-4000-8000-0000000000a1', '11111111-1111-1111-1111-111111111111', credit, debit, 100000)
      .run();
    const reminder = await seedReminder({ amount: '1000' });
    await seedReminderPayment({ reminder_id: reminder, txn_id: debit, cents: 100000, due: '2026-11-10' });

    expect(await purgeDeletedTransactions(testDb(), store(), NOW)).toBe(1);
    expect(await rowsOf('transaction_offsets')).toHaveLength(0);
    expect(await rowsOf('reminder_payments')).toHaveLength(0);
    expect(await rowsOf('reminders')).toHaveLength(1);
    expect(await rowsOf('transactions')).toHaveLength(1);
  });

  it('works in batches and keeps going while batches come back full; a backlog drains over several runs', async () => {
    const db = testDb();
    const insert = db.prepare(
      `INSERT INTO transactions (id, user_id, amount, type, kind, transaction_at, local_date, month_key, created_at, updated_at, deleted_at, counterparty_name, counterparty_type, payee_key)
       VALUES (?, '11111111-1111-1111-1111-111111111111', 100, 'debit', 'spend', '2026-01-01T00:00:00.000Z', '2026-01-01', '2026-01', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', ?, 'x', 'merchant', 'x')`,
    );
    const rows = Array.from({ length: 620 }, (_, i) => insert.bind(`00000000-0000-4000-9000-${String(i).padStart(12, '0')}`, ago(45)));
    for (let i = 0; i < rows.length; i += 100) await db.batch(rows.slice(i, i + 100));
    const first = await purgeDeletedTransactions(db, store(), NOW);
    expect(first).toBe(500); // 10 batches of 50 per run
    expect(await purgeDeletedTransactions(db, store(), NOW)).toBe(120);
    expect(await rowsOf('transactions')).toHaveLength(0);
  });

  it('a row whose media could not be deleted stays for the next run; nothing is orphaned', async () => {
    await put('receipts/u/stuck.jpg', JPEG);
    await put('receipts/u/fine.jpg', JPEG);
    const stuck = await seedTransaction({ deleted_at: ago(45), receipt_url: 'receipts/u/stuck.jpg' });
    await seedTransaction({ deleted_at: ago(45), receipt_url: 'receipts/u/fine.jpg' });
    const flaky = {
      ...store(),
      bucket: {
        delete: (key: string) => (key.endsWith('stuck.jpg') ? Promise.reject(new Error('r2 down')) : workerEnv.MEDIA.delete(key)),
      } as unknown as R2Bucket,
    };
    expect(await purgeDeletedTransactions(testDb(), flaky, NOW)).toBe(1);
    expect((await rowsOf<{ id: string }>('transactions')).map((r) => r.id)).toEqual([stuck]);
    expect(await keys()).toEqual(['receipts/u/stuck.jpg']);
    expect(await purgeDeletedTransactions(testDb(), store(), NOW)).toBe(1);
    expect(await keys()).toEqual([]);
  });

  it('a legacy Supabase URL or a bad reference is purged without touching R2 for it', async () => {
    await seedTransaction({ deleted_at: ago(45), receipt_url: 'https://old.supabase.co/storage/v1/object/public/receipts/u/x.jpg', voice_url: 'not a key' });
    expect(await purgeDeletedTransactions(testDb(), store(), NOW)).toBe(1);
  });

  it('runs in the first sweep of the hour only', async () => {
    await put('receipts/u/old.jpg', JPEG);
    const id = await seedTransaction({ deleted_at: ago(45), receipt_url: 'receipts/u/old.jpg' });
    const controller = (at: string) => ({ cron: '*/5 * * * *', scheduledTime: Date.parse(at), type: 'scheduled', noRetry: () => undefined }) as ScheduledController;
    const env = () => ({ ...makeEnv(), INGEST_QUEUE: new FakeQueue().asQueue() }) as unknown as Bindings;
    await worker.scheduled?.(controller('2026-10-04T12:05:00Z'), env(), {} as ExecutionContext);
    expect((await rowsOf<{ id: string }>('transactions')).map((r) => r.id)).toEqual([id]);
    expect(await keys()).toEqual(['receipts/u/old.jpg']);
    // `ago()` is relative to NOW (12:00); at 13:00 the row has been deleted for 45 days and one hour.
    await worker.scheduled?.(controller('2026-10-04T13:00:00Z'), env(), {} as ExecutionContext);
    expect(await rowsOf('transactions')).toHaveLength(0);
    expect(await keys()).toEqual([]);
  });
});
