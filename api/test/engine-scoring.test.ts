import { afterEach, describe, expect, it, vi } from 'vitest';

import { forecastFlexibleAsOf, replayMonth } from '../src/features/engine/backtest';
import { detectCadences } from '../src/features/engine/cadence';
import { ENGINE_CRON, runEngineForUser } from '../src/features/engine/job';
import { MAX_EVIDENCE, MIN_CONFIDENCE, confidenceOf, updateEvidence } from '../src/features/engine/confidence';
import { hashSeed, mulberry32 } from '../src/features/engine/math';
import type { EngineProfile } from '../src/features/engine/patterns';
import { loadEngineRows } from '../src/features/engine/patterns';
import type { ForecastAccuracyResponse, ForecastResponse } from '../src/features/engine/schemas';
import { MIN_SCORED_MONTHS, WIDTH_MAX, WIDTH_MIN, runScoring, tunedWidth, tunedWindow } from '../src/features/engine/scoring';
import type { EngineTxRow } from '../src/features/engine/types';
import worker from '../src/index';
import { USER_ID, call, makeEnv } from './helpers';
import { failingOn, oneRow, rowsOf, seedTransaction, seedUser, testDb } from './db';
import { FakeMessage, FakeQueue, fakeBatch } from './ingest-fixtures';

const DAY = 86_400_000;
const IST = 'Asia/Kolkata';
const OTHER = '22222222-2222-2222-2222-222222222222';
/** 03:00 UTC is 08:30 IST: the same local day. */
const day = (iso: string) => Date.parse(`${iso}T03:00:00.000Z`);
const ctx = {} as ExecutionContext;
const controller = (cron: string, scheduledTime: number) => ({ cron, scheduledTime, type: 'scheduled', noRetry: () => undefined }) as ScheduledController;

afterEach(() => vi.useRealTimers());

const setNow = (ms: number) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ms);
};

const pattern = (key: string) =>
  oneRow<{ kind: string; alpha: number; beta: number; count_120d: number; next_expected_at: string | null; last_scored_expected_at: string | null; suppressed: number }>(
    'payee_patterns',
    'user_id = ? AND payee_key = ?',
    USER_ID,
    key,
  );
const profileOf = async () => JSON.parse((await oneRow<{ profile: string }>('engine_patterns', 'user_id = ?', USER_ID))!.profile) as EngineProfile;
const snapshots = async () =>
  (await rowsOf<Record<string, number | string | null>>('forecast_snapshots', 'user_id = ?', USER_ID)).sort((a, b) => (a['month'] as string).localeCompare(b['month'] as string) || (a['day'] as number) - (b['day'] as number));

async function snap(month: string, d: number, p10: number, p50: number, p90: number, actual: number | null, userId = USER_ID, width = 1) {
  await testDb()
    .prepare("INSERT INTO forecast_snapshots (user_id, month, day, method, p10, p50, p90, actual, width_factor) VALUES (?, ?, ?, 'stats', ?, ?, ?, ?, ?)")
    .bind(userId, month, d, p10, p50, p90, actual, width)
    .run();
}

/** A Swiggy order every 4 days (200 each) for 80 days before `now` (the newest 3 days ago): a regular habit, expected 4 days after the newest. */
async function seedSwiggy(now: number, userId = USER_ID) {
  for (let ago = 3; ago <= 79; ago += 4) await seedTransaction({ user_id: userId, amount: '200', counterparty_name: 'Swiggy', transaction_at: new Date(now - ago * DAY).toISOString() });
}

describe('implicit hits and misses', () => {
  const T0 = day('2026-10-22');
  /** The newest order is 2026-10-19, so Swiggy is expected on 2026-10-23 and judged once 2026-10-26 starts. */
  const T1 = day('2026-10-26');

  it('does not judge an expectation while its window is open', async () => {
    await seedSwiggy(T0);
    await runEngineForUser(makeEnv(), USER_ID, T0);
    expect(await pattern('swiggy')).toMatchObject({ alpha: 2, beta: 1, last_scored_expected_at: null, next_expected_at: '2026-10-23T03:00:00.000Z' });
    await runEngineForUser(makeEnv(), USER_ID, day('2026-10-25')); // 23 + 2 days is not before the 25th
    expect(await pattern('swiggy')).toMatchObject({ alpha: 2, beta: 1, last_scored_expected_at: null });
  });

  it('a miss decays the old evidence and adds 1 to beta, once per expectation', async () => {
    await seedSwiggy(T0);
    await runEngineForUser(makeEnv(), USER_ID, T0);
    await runEngineForUser(makeEnv(), USER_ID, T1);
    // The date moved on by one interval (the 27th), which is not over yet.
    expect(await pattern('swiggy')).toMatchObject({ alpha: 1.8, beta: 1.9, last_scored_expected_at: '2026-10-23T03:00:00.000Z', next_expected_at: '2026-10-27T03:00:00.000Z' });
    await runEngineForUser(makeEnv(), USER_ID, T1);
    expect(await pattern('swiggy')).toMatchObject({ alpha: 1.8, beta: 1.9 });
  });

  it('a payee that stays away keeps missing, every date once, and a second run the same night judges nothing', async () => {
    await seedSwiggy(T0);
    await runEngineForUser(makeEnv(), USER_ID, T0);
    const NOV2 = day('2026-11-02'); // the 23rd and the 27th are over (the 31st is not)
    await runEngineForUser(makeEnv(), USER_ID, NOV2);
    expect(await pattern('swiggy')).toMatchObject({ alpha: 1.62, beta: 2.71, last_scored_expected_at: '2026-10-27T03:00:00.000Z', next_expected_at: '2026-10-31T03:00:00.000Z' });
    await runEngineForUser(makeEnv(), USER_ID, NOV2);
    expect(await pattern('swiggy')).toMatchObject({ alpha: 1.62, beta: 2.71 });
  });

  it('a habit that was given up drops below the hide threshold within a handful of misses', async () => {
    await seedSwiggy(T0);
    await runEngineForUser(makeEnv(), USER_ID, T0);
    await testDb().prepare("UPDATE payee_patterns SET alpha = 6, beta = 1 WHERE payee_key = 'swiggy'").run(); // a good record, then nothing more
    const confidence = async () => {
      const p = await pattern('swiggy');
      return confidenceOf(p!.alpha, p!.beta);
    };
    await runEngineForUser(makeEnv(), USER_ID, day('2026-11-05')); // the 23rd, 27th and 31st were missed
    expect(await confidence()).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
    await runEngineForUser(makeEnv(), USER_ID, day('2026-12-01')); // and the five dates after them
    expect(await confidence()).toBeLessThan(MIN_CONFIDENCE);
  });

  it('a hit decays the old evidence and adds 1 to alpha, and the next expectation is judged later', async () => {
    await seedSwiggy(T0);
    await seedTransaction({ amount: '200', counterparty_name: 'Swiggy', transaction_at: '2026-10-25T10:00:00.000Z' }); // expected 23rd: the edge of the window
    await runEngineForUser(makeEnv(), USER_ID, T0);
    await runEngineForUser(makeEnv(), USER_ID, T1);
    expect(await pattern('swiggy')).toMatchObject({ alpha: 2.8, beta: 0.9, last_scored_expected_at: '2026-10-23T03:00:00.000Z' });
    expect((await pattern('swiggy'))?.next_expected_at).not.toBe('2026-10-23T03:00:00.000Z'); // the recompute moved on
    await runEngineForUser(makeEnv(), USER_ID, T1);
    expect(await pattern('swiggy')).toMatchObject({ alpha: 2.8, beta: 0.9 });
  });

  it('keeps alpha + beta within the cap', () => {
    const next = updateEvidence(18, 6, 1, 0);
    expect(next.alpha + next.beta).toBeCloseTo(MAX_EVIDENCE, 3);
    expect(next.alpha / next.beta).toBeCloseTo((18 * 0.9 + 1) / (6 * 0.9), 2);
    expect(updateEvidence(2, 1, 0, 0)).toEqual({ alpha: 1.8, beta: 0.9 });
  });

  it('a debit 3 days late is a miss', async () => {
    await seedSwiggy(T0);
    await seedTransaction({ amount: '200', counterparty_name: 'Swiggy', transaction_at: '2026-10-26T01:00:00.000Z' });
    await runEngineForUser(makeEnv(), USER_ID, T0);
    await runEngineForUser(makeEnv(), USER_ID, T1);
    expect(await pattern('swiggy')).toMatchObject({ alpha: 1.8, beta: 1.9 });
  });

  it('counts a merged alias as the payee, and ignores credits and other payees', async () => {
    await seedSwiggy(T0);
    await runEngineForUser(makeEnv(), USER_ID, T0);
    await testDb().prepare('UPDATE engine_patterns SET payee_merges = ? WHERE user_id = ?').bind(JSON.stringify({ 'swiggy instamart': 'swiggy' }), USER_ID).run();
    await seedTransaction({ amount: '300', counterparty_name: 'Swiggy Instamart', transaction_at: '2026-10-24T05:00:00.000Z' });
    await seedTransaction({ amount: '300', type: 'credit', counterparty_name: 'Swiggy', transaction_at: '2026-10-23T05:00:00.000Z' });
    await seedTransaction({ amount: '300', counterparty_name: 'Zomato', transaction_at: '2026-10-23T05:00:00.000Z' });
    await runEngineForUser(makeEnv(), USER_ID, T1);
    expect(await pattern('swiggy')).toMatchObject({ alpha: 2.8, beta: 0.9 });
  });

  it('leaves a suppressed payee and an income payee alone', async () => {
    await seedSwiggy(T0);
    for (const m of ['2026-08-01', '2026-09-01', '2026-10-01']) await seedTransaction({ amount: '80000', type: 'credit', counterparty_name: 'Acme Corp', transaction_at: `${m}T04:00:00.000Z` });
    await runEngineForUser(makeEnv(), USER_ID, T0);
    await testDb().prepare("UPDATE payee_patterns SET suppressed = 1 WHERE payee_key = 'swiggy'").run();
    await runEngineForUser(makeEnv(), USER_ID, day('2026-11-20'));
    expect(await pattern('swiggy')).toMatchObject({ alpha: 2, beta: 1, last_scored_expected_at: null });
    expect(await pattern('acme corp')).toMatchObject({ kind: 'income', alpha: 1, beta: 1, last_scored_expected_at: null });
  });

  it('does not prune a row whose confidence was learned back to the default numbers', async () => {
    // Intervals of 2 and 6 days: regular (cv 0.5) but not steady, so the prior is Beta(1, 1); a judged expectation leaves a mark whatever the numbers.
    const ids: string[] = [];
    for (const ago of [3, 9, 11, 17, 19, 25, 27]) ids.push(await seedTransaction({ amount: '200', counterparty_name: 'Swiggy', transaction_at: new Date(T0 - ago * DAY).toISOString() }));
    await seedTransaction({ amount: '200', counterparty_name: 'Swiggy', transaction_at: '2026-10-24T05:00:00.000Z' });
    await runEngineForUser(makeEnv(), USER_ID, T0);
    expect(await pattern('swiggy')).toMatchObject({ alpha: 1, beta: 1, next_expected_at: '2026-10-23T03:00:00.000Z' });
    await runEngineForUser(makeEnv(), USER_ID, T1);
    expect(await pattern('swiggy')).toMatchObject({ alpha: 1.9, beta: 0.9, last_scored_expected_at: '2026-10-23T03:00:00.000Z' });

    // Swiggy stops qualifying (two live orders left): a never-judged default row would be deleted, this one is kept inactive.
    await testDb().prepare('UPDATE transactions SET deleted_at = ? WHERE id <> ? AND id <> ?').bind(T1, ids[0] as string, ids[1] as string).run();
    await testDb().prepare('UPDATE payee_patterns SET alpha = 1, beta = 1').run(); // exactly the default numbers
    await runEngineForUser(makeEnv(), USER_ID, T1);
    expect(await pattern('swiggy')).toMatchObject({ alpha: 1, beta: 1, count_120d: 0, next_expected_at: null });
  });

  it('still deletes a default row that was never judged when it stops qualifying', async () => {
    await seedSwiggy(T0);
    await runEngineForUser(makeEnv(), USER_ID, T0);
    await testDb().prepare('UPDATE transactions SET deleted_at = ?').bind(T0).run();
    await runEngineForUser(makeEnv(), USER_ID, T0);
    expect(await pattern('swiggy')).toBeNull();
  });
});

describe('snapshots', () => {
  /** Swiggy every 4 days for 80 days before `now`, Rs 200 each. */
  const prepare = async (now: number) => {
    await seedSwiggy(now);
    await runEngineForUser(makeEnv(), USER_ID, now);
  };

  it('saves one on days 1, 7, 14 and 21 of the local month, and no other', async () => {
    const dates = ['2026-10-01', '2026-10-07', '2026-10-14', '2026-10-21'];
    const nows = [...dates, '2026-10-02', '2026-10-13', '2026-10-15', '2026-10-22', '2026-10-31'].map(day);
    await prepare(day('2026-10-22'));
    for (const now of nows) await runScoring(makeEnv(), USER_ID, now);
    const rows = await snapshots();
    expect(rows.map((r) => [r['month'], r['day'], r['method']])).toEqual(dates.map((d) => ['2026-10', Number(d.slice(8)), 'stats']));
    for (const r of rows) {
      expect(r['p10'] as number).toBeLessThanOrEqual(r['p50'] as number);
      expect(r['p50'] as number).toBeLessThanOrEqual(r['p90'] as number);
      expect(r['p50']).toBeGreaterThan(0);
      expect(r['actual']).toBeNull();
    }
  });

  it('is idempotent: a second run the same day keeps the first snapshot', async () => {
    await prepare(day('2026-10-14'));
    expect(await runScoring(makeEnv(), USER_ID, day('2026-10-14'))).toMatchObject({ status: 'done', snapshot: true });
    const first = await snapshots();
    await seedTransaction({ amount: '5000', counterparty_name: 'Croma', transaction_at: '2026-10-14T01:00:00.000Z' });
    await runScoring(makeEnv(), USER_ID, day('2026-10-14'));
    expect(await snapshots()).toEqual(first);
  });

  it('is the landing the forecast shows that day', async () => {
    const now = day('2026-10-14');
    await prepare(now);
    await runScoring(makeEnv(), USER_ID, now);
    setNow(now);
    const body = await (await call(`/api/v1/forecast?year=2026&month=10&timezone=${encodeURIComponent(IST)}`)).json<ForecastResponse>();
    const [row] = await snapshots();
    expect([row?.['p10'], row?.['p50'], row?.['p90']]).toEqual([body.landing.p10, body.landing.p50, body.landing.p90].map((m) => Math.round(Number(m) * 100)));
  });

  it('skips a user still in learning mode, and writes nothing else', async () => {
    const now = day('2026-10-14');
    await seedTransaction({ amount: '100', transaction_at: new Date(now - 5 * DAY).toISOString() });
    await runEngineForUser(makeEnv(), USER_ID, now);
    expect(await runScoring(makeEnv(), USER_ID, now)).toMatchObject({ status: 'done', snapshot: false });
    expect(await snapshots()).toHaveLength(0);
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ dirty: 0 });
  });

  it('uses the user\'s own local day', async () => {
    // 2026-10-13 20:00 UTC is October 14 in Kolkata but still the 13th in Los Angeles.
    const now = Date.parse('2026-10-13T20:00:00.000Z');
    await seedSwiggy(now);
    await runEngineForUser(makeEnv(), USER_ID, now);
    await testDb().prepare("UPDATE engine_patterns SET timezone = 'America/Los_Angeles'").run();
    await runEngineForUser(makeEnv(), USER_ID, now);
    expect(await runScoring(makeEnv(), USER_ID, now)).toMatchObject({ snapshot: false });
    await testDb().prepare("UPDATE engine_patterns SET timezone = 'Asia/Kolkata'").run();
    await runEngineForUser(makeEnv(), USER_ID, now);
    expect(await runScoring(makeEnv(), USER_ID, now)).toMatchObject({ snapshot: true });
    expect(await snapshots()).toMatchObject([{ month: '2026-10', day: 14 }]);
  });

  it('never throws: a database failure is a failed result', async () => {
    await prepare(day('2026-10-14'));
    expect(await runScoring(makeEnv({ DB: failingOn(/forecast_snapshots/) }), USER_ID, day('2026-10-14'))).toMatchObject({ status: 'failed', snapshot: false });
  });

  it('the queue consumer saves it after the rebuild and acks', async () => {
    const now = day('2026-10-14');
    setNow(now);
    await seedSwiggy(now);
    const message = new FakeMessage({ userId: USER_ID });
    await worker.queue?.(fakeBatch('dime-engine', [message]), makeEnv(), ctx);
    expect(message.acked).toBe(true);
    expect(await snapshots()).toMatchObject([{ month: '2026-10', day: 14 }]);
  });
});

describe('fan-out on snapshot days', () => {
  const setProfile = (userId: string, mode: string, computedAt: string) =>
    testDb()
      .prepare("INSERT INTO engine_patterns (user_id, version, history_days, profile, dirty, computed_at) VALUES (?, 1, 0, ?, 0, ?)")
      .bind(userId, JSON.stringify({ mode }), computedAt)
      .run();
  /** Profiles computed two days before the night (the weekly refresh would queue older ones whatever the day), except `IDLE` when `idleAgo` is given. */
  const queued = async (scheduledTime: number, idleAgo?: number) => {
    await testDb().prepare('UPDATE engine_patterns SET computed_at = ?').bind(new Date(scheduledTime - 2 * DAY).toISOString()).run();
    if (idleAgo !== undefined) await testDb().prepare('UPDATE engine_patterns SET computed_at = ? WHERE user_id = ?').bind(new Date(scheduledTime - idleAgo * DAY).toISOString(), 'a0000000-0000-4000-8000-000000000003').run();
    const queue = new FakeQueue();
    await worker.scheduled?.(controller(ENGINE_CRON, scheduledTime), makeEnv({ ENGINE_QUEUE: queue.asQueue() }), ctx);
    return (queue.sent as Array<{ userId: string }>).map((m) => m.userId).sort();
  };

  it('queues active non-learning profiles within a day of days 1, 7, 14 and 21 (IST), so any timezone gets its own', async () => {
    const [FULL, LEARNING, IDLE] = ['a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003'] as const;
    for (const id of [FULL, LEARNING, IDLE]) await seedUser(id);
    const ago = (d: number, from = '2026-10-14T00:00:00.000Z') => new Date(Date.parse(from) - d * DAY).toISOString();
    await setProfile(FULL, 'full', ago(2));
    await setProfile(LEARNING, 'learning', ago(2));
    await setProfile(IDLE, 'full', ago(2));
    // The cron fires at 21:00 UTC the evening before: 2026-10-13 21:00 UTC is 02:30 IST on the 14th.
    expect(await queued(Date.parse('2026-10-13T21:00:00.000Z'))).toEqual([FULL, IDLE].sort());
    expect(await queued(Date.parse('2026-10-14T21:00:00.000Z'))).toEqual([FULL, IDLE].sort()); // the 15th: still the 14th in the Americas
    expect(await queued(Date.parse('2026-10-12T21:00:00.000Z'))).toEqual([FULL, IDLE].sort()); // the 13th: already the 14th east of India
    expect(await queued(Date.parse('2026-10-16T21:00:00.000Z'))).toEqual([]); // the 17th
    expect(await queued(Date.parse('2026-10-11T21:00:00.000Z'))).toEqual([]); // the 12th
    // The last day of a month is near the 1st.
    expect(await queued(Date.parse('2026-10-30T21:00:00.000Z'))).toEqual([FULL, IDLE].sort()); // 2026-10-31 IST
    // Computed over 30 days before a snapshot day: not active, but the weekly refresh queues it anyway.
    expect(await queued(Date.parse('2026-10-13T21:00:00.000Z'), 40)).toEqual([FULL, IDLE].sort());
    expect(await queued(Date.parse('2026-10-16T21:00:00.000Z'), 40)).toEqual([IDLE]);
  });
});

describe('month-end scoring', () => {
  it('fills the actual of a finished month with its debit total, and only that month, once', async () => {
    await seedSwiggy(day('2026-11-02'));
    await runEngineForUser(makeEnv(), USER_ID, day('2026-11-02'));
    await seedTransaction({ amount: '12345.67', counterparty_name: 'Croma', transaction_at: '2026-10-30T10:00:00.000Z' });
    await seedTransaction({ amount: '500', type: 'credit', counterparty_name: 'Acme', transaction_at: '2026-10-30T10:00:00.000Z' });
    await seedTransaction({ amount: '777', counterparty_name: 'Croma', transaction_at: '2026-11-01T10:00:00.000Z' });
    await snap('2026-10', 14, 100, 200, 300, null);
    await snap('2026-10', 21, 100, 200, 300, 42); // already scored: left alone
    await snap('2026-11', 1, 100, 200, 300, null); // this month is not over
    const debitsOfOctober = (await rowsOf<{ amount: number }>('transactions', "type = 'debit' AND transaction_at >= '2026-10-01' AND transaction_at < '2026-11-01'")).reduce((a, r) => a + r.amount, 0);

    expect(await runScoring(makeEnv(), USER_ID, day('2026-11-02'))).toMatchObject({ status: 'done', scored: 1 });
    expect((await snapshots()).map((r) => [r['month'], r['day'], r['actual']])).toEqual([
      ['2026-10', 14, debitsOfOctober],
      ['2026-10', 21, 42],
      ['2026-11', 1, null],
    ]);
    expect(debitsOfOctober).toBeGreaterThan(1_234_567);
    expect(await runScoring(makeEnv(), USER_ID, day('2026-11-03'))).toMatchObject({ scored: 0 });
  });

  it('scores a month the night after it ends even when day 1 was missed', async () => {
    await seedSwiggy(day('2026-11-09'));
    await runEngineForUser(makeEnv(), USER_ID, day('2026-11-09'));
    await snap('2026-10', 21, 100, 200, 300, null);
    expect(await runScoring(makeEnv(), USER_ID, day('2026-11-09'))).toMatchObject({ scored: 1 });
    expect((await snapshots())[0]?.['actual']).not.toBeNull();
  });
});

const simMonth = (i: number) => `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

describe('width tuning', () => {
  /** `n` snapshots of a month, all made with `width`, with the actual outside (or inside) the range. */
  async function month(name: string, n: number, inside: boolean, width = 1, userId = USER_ID) {
    for (const d of [1, 7, 14, 21].slice(0, n)) await snap(name, d, 900, 1000, 1100, inside ? 1020 : 2000, userId, width);
  }

  it('waits for four scored snapshots made with the width in force', async () => {
    await month('2026-09', 2, false);
    await month('2026-08', 1, false);
    expect(await tunedWidth(testDb(), USER_ID, 1)).toBeNull();
    await month('2026-07', 1, false);
    expect(await tunedWidth(testDb(), USER_ID, 1)).toBe(1.1);
    expect(await tunedWidth(testDb(), USER_ID, 1.1)).toBeNull(); // nothing was made with 1.1 yet: it has not been tried
  });

  it('does not count snapshots made with another width', async () => {
    await month('2026-09', 4, false, 1.3);
    await month('2026-08', 3, false, 1);
    expect(await tunedWidth(testDb(), USER_ID, 1)).toBeNull();
    expect(await tunedWidth(testDb(), USER_ID, 1.3)).toBe(1.43);
  });

  it('widens by 10% when under 70% of the actuals are inside the range, within the cap', async () => {
    await month('2026-08', 2, true);
    await month('2026-09', 2, false);
    await month('2026-10', 2, false);
    expect(await tunedWidth(testDb(), USER_ID, 1)).toBe(1.1); // 2 of 6 inside
    await month('2026-11', 4, false, 2.4);
    await month('2026-12', 4, false, 2.5);
    expect(await tunedWidth(testDb(), USER_ID, 2.4)).toBe(WIDTH_MAX);
    expect(await tunedWidth(testDb(), USER_ID, WIDTH_MAX)).toBeNull();
  });

  it('narrows by 5% when over 90% are inside and the middle is close, down to the floor', async () => {
    for (const name of ['2026-08', '2026-09', '2026-10']) await month(name, 3, true);
    expect(await tunedWidth(testDb(), USER_ID, 1)).toBe(0.95);
    for (const name of ['2026-11', '2026-12', '2027-01']) await month(name, 4, true, 0.62);
    expect(await tunedWidth(testDb(), USER_ID, 0.62)).toBe(WIDTH_MIN);
    for (const name of ['2027-02', '2027-03', '2027-04']) await month(name, 4, true, WIDTH_MIN);
    expect(await tunedWidth(testDb(), USER_ID, WIDTH_MIN)).toBeNull();
  });

  it('does not narrow a range that is inside but whose middle is far off', async () => {
    for (const name of ['2026-08', '2026-09']) for (const d of [7, 14]) await snap(name, d, 100, 1000, 3000, 1500); // inside, 33% off
    expect(await tunedWidth(testDb(), USER_ID, 1)).toBeNull();
  });

  it('leaves it alone between 70% and 90%, and ignores months without spending and other users', async () => {
    await seedUser(OTHER);
    for (const name of ['2026-08', '2026-09']) for (const d of [7, 14, 21, 1]) await snap(name, d, 900, 1000, 1100, d === 7 ? 5000 : 1000); // 6 of 8 inside
    expect(await tunedWidth(testDb(), USER_ID, 1)).toBeNull();
    await snap('2026-07', 14, 900, 1000, 1100, 0); // a month without spending is not scored
    await month('2026-06', 4, false, 1, OTHER);
    expect(await tunedWidth(testDb(), USER_ID, 1)).toBeNull();
  });

  it('does not oscillate or overshoot over many simulated months, and respects both caps', async () => {
    const widths = [1];
    for (let i = 0; i < 20; i++) {
      const current = widths[widths.length - 1] as number;
      await month(simMonth(i), 4, false, current); // every month the range is too narrow
      widths.push((await tunedWidth(testDb(), USER_ID, current)) ?? current);
    }
    expect(widths[1]).toBe(1.1);
    expect(widths[2]).toBe(1.21); // one step per month, never two at once
    expect(Math.max(...widths)).toBe(WIDTH_MAX);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));

    await testDb().prepare('DELETE FROM forecast_snapshots').run();
    const narrowing = [1];
    for (let i = 0; i < 20; i++) {
      const current = narrowing[narrowing.length - 1] as number;
      await month(simMonth(i), 4, true, current); // every month the range is right, with a close middle
      narrowing.push((await tunedWidth(testDb(), USER_ID, current)) ?? current);
    }
    expect(narrowing[1]).toBe(0.95);
    expect(Math.min(...narrowing)).toBe(WIDTH_MIN);
    expect(narrowing).toEqual([...narrowing].sort((a, b) => b - a));
  });

  it('runScoring stores the new width, rebuilds the profile with it, and a nightly rebuild keeps it', async () => {
    await seedSwiggy(day('2026-11-02'));
    await runEngineForUser(makeEnv(), USER_ID, day('2026-11-02'));
    await snap('2026-09', 14, 10, 20, 30, 1_000_000); // scored, missed
    await snap('2026-09', 21, 10, 20, 30, 1_000_000);
    await snap('2026-10', 14, 10, 20, 30, null); // scored tonight: Swiggy's few orders, also misses
    await snap('2026-10', 21, 10, 20, 30, null);
    const result = await runScoring(makeEnv(), USER_ID, day('2026-11-02'));
    expect(result).toMatchObject({ status: 'done', scored: 1, tuned: true });
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ width_factor: 1.1, last_tuned_month: '2026-10' });
    expect((await profileOf()).widthFactor).toBe(1.1);
    await runEngineForUser(makeEnv(), USER_ID, day('2026-11-03'));
    expect((await profileOf()).widthFactor).toBe(1.1);
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ width_factor: 1.1, window_days: expect.any(Number) as number });
    // Nothing new to learn from: the next night leaves it.
    expect(await runScoring(makeEnv(), USER_ID, day('2026-11-03'))).toMatchObject({ scored: 0, tuned: false });
  });

  it('a snapshot records the tuning in force', async () => {
    await seedSwiggy(day('2026-10-14'));
    await runEngineForUser(makeEnv(), USER_ID, day('2026-10-14'));
    await testDb().prepare('UPDATE engine_patterns SET width_factor = 1.3, window_days = 60').run();
    await runScoring(makeEnv(), USER_ID, day('2026-10-14'));
    expect(await snapshots()).toMatchObject([{ month: '2026-10', day: 14, width_factor: 1.3, window_days: 60 }]);
  });

  it('resumes after a failure: the month is scored, the tuning did not happen, the next night does it', async () => {
    await seedSwiggy(day('2026-11-02'));
    await runEngineForUser(makeEnv(), USER_ID, day('2026-11-02'));
    await month('2026-09', 4, false);
    await snap('2026-10', 14, 10, 20, 30, null);
    await snap('2026-10', 21, 10, 20, 30, null);
    const broken = makeEnv({ DB: failingOn(/UPDATE engine_patterns SET width_factor/) });
    expect(await runScoring(broken, USER_ID, day('2026-11-02'))).toMatchObject({ status: 'failed', scored: 1, tuned: false });
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ width_factor: 1, last_tuned_month: null });
    expect((await snapshots()).every((r) => r['actual'] !== null)).toBe(true);

    // Nothing is left to score, but the latest finished month is newer than the last one tuned.
    expect(await runScoring(makeEnv(), USER_ID, day('2026-11-03'))).toMatchObject({ status: 'done', scored: 0, tuned: true });
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ width_factor: 1.1, last_tuned_month: '2026-10' });
  });

  it('a tuning rebuild does not score an expectation twice', async () => {
    const NOV2 = day('2026-11-02');
    await seedSwiggy(day('2026-10-22'));
    await runEngineForUser(makeEnv(), USER_ID, day('2026-10-22'));
    await month('2026-09', 4, false);
    await snap('2026-10', 14, 10, 20, 30, null);
    await snap('2026-10', 21, 10, 20, 30, null);
    await runEngineForUser(makeEnv(), USER_ID, NOV2); // judges the missed dates
    const judged = await pattern('swiggy');
    expect(judged).toMatchObject({ alpha: 1.62, beta: 2.71 });
    expect(await runScoring(makeEnv(), USER_ID, NOV2)).toMatchObject({ tuned: true }); // rebuilds the profile once more
    expect(await pattern('swiggy')).toEqual(judged);
  });

  it('a stub row made before the first job has the defaults, and the job keeps what was tuned', async () => {
    await seedSwiggy(day('2026-10-22'));
    await testDb().prepare("INSERT INTO engine_patterns (user_id, version, history_days, profile, dirty, dirty_seq, computed_at) VALUES (?, 0, 0, '{}', 1, 1, '1970-01-01T00:00:00.000Z')").bind(USER_ID).run();
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ width_factor: 1, window_days: 90 });
    await testDb().prepare('UPDATE engine_patterns SET width_factor = 1.3, window_days = 60').run();
    await runEngineForUser(makeEnv(), USER_ID, day('2026-10-22'));
    expect(await profileOf()).toMatchObject({ widthFactor: 1.3, windowDays: 60 });
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ width_factor: 1.3, window_days: 60 });
  });
});

describe('window tuning', () => {
  /** Rs 1000 a day until 2026-07-31, Rs 100 a day after it: only a short window forecasts September well. */
  async function seedRegimeChange(bigUntil: string) {
    const db = testDb();
    const stmts = [];
    for (let t = Date.parse('2026-05-01T05:00:00.000Z'); t <= Date.parse('2026-10-01T05:00:00.000Z'); t += DAY) {
      const iso = new Date(t).toISOString();
      const rupees = iso.slice(0, 10) <= bigUntil ? 1000 : 100;
      stmts.push(
        db
          .prepare(
            `INSERT INTO transactions (id, user_id, amount, type, transaction_at, created_at, updated_at, counterparty_name, counterparty_type, payee_key)
             VALUES (?, ?, ?, 'debit', ?, ?, ?, ?, 'merchant', ?)`,
          )
          .bind(`r-${iso}`, USER_ID, rupees * 100, iso, iso, iso, `Shop ${iso.slice(8, 10)}`, `shop ${iso.slice(8, 10)}`),
      );
    }
    await db.batch(stmts);
  }

  it('picks the shortest window after a drop in spending', async () => {
    await seedRegimeChange('2026-07-31');
    expect(await tunedWindow(testDb(), USER_ID, IST, '2026-09', 90, 1)).toBe(60);
  });

  it('keeps the current window when every window does equally well', async () => {
    await seedRegimeChange('2099-01-01'); // Rs 1000 every day: any window forecasts it exactly
    expect(await tunedWindow(testDb(), USER_ID, IST, '2026-09', 90, 1)).toBeNull();
    expect(await tunedWindow(testDb(), USER_ID, IST, '2026-09', 120, 1)).toBeNull();
  });

  it('says nothing for a month with no flexible spend or too little history', async () => {
    expect(await tunedWindow(testDb(), USER_ID, IST, '2026-09', 90, 1)).toBeNull();
  });

  it('runScoring applies it together with the width, and the nightly rebuild keeps both', async () => {
    await seedRegimeChange('2026-07-31');
    await runEngineForUser(makeEnv(), USER_ID, day('2026-10-02'));
    // Three of four snapshots inside the range: the width stays; September is scored tonight.
    await snap('2026-08', 14, 800_000, 900_000, 1_000_000, 900_000);
    await snap('2026-08', 21, 800_000, 900_000, 1_000_000, 900_000);
    await snap('2026-09', 7, 200_000, 300_000, 400_000, null);
    await snap('2026-09', 14, 100_000, 120_000, 140_000, null);
    expect(await runScoring(makeEnv(), USER_ID, day('2026-10-02'))).toMatchObject({ scored: 1, tuned: true });
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ width_factor: 1, window_days: 60 });
    expect(await profileOf()).toMatchObject({ windowDays: 60, widthFactor: 1 });
    await runEngineForUser(makeEnv(), USER_ID, day('2026-10-03'));
    expect(await profileOf()).toMatchObject({ windowDays: 60 });
  });

  it('is not tried with a single scored month', async () => {
    await seedRegimeChange('2026-07-31');
    await runEngineForUser(makeEnv(), USER_ID, day('2026-10-02'));
    await snap('2026-09', 14, 1, 2, 3, null);
    expect(MIN_SCORED_MONTHS).toBe(2);
    expect(await runScoring(makeEnv(), USER_ID, day('2026-10-02'))).toMatchObject({ scored: 1, tuned: false });
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ width_factor: 1, window_days: 90 });
  });
});

describe('accuracy', () => {
  const get = (path = '/api/v1/forecast/accuracy', opts: Parameters<typeof call>[1] = {}) => call(path, opts);

  it('needs a signed-in user, and is empty before any month is scored', async () => {
    expect((await get(undefined, { token: false })).status).toBe(401);
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ months: [] });
  });

  it('lists the last three scored months that have a day-14 snapshot, newest first', async () => {
    await snap('2026-04', 14, 900, 1000, 1100, 1000); // the fourth month back: dropped
    await snap('2026-06', 14, 900, 1000, 1100, 1000);
    await snap('2026-07', 14, 900, 1000, 1100, 1250); // 20% off
    await snap('2026-07', 21, 900, 1250, 1300, 1250); // a better, later one is not the report
    await snap('2026-08', 7, 400, 500, 600, 1000); // no day 14: not reported
    await snap('2026-08', 21, 900, 950, 1100, 1000);
    await snap('2026-09', 14, 1000, 1060, 1100, 1000); // 6% off
    await snap('2026-09', 1, 1, 2, 3, 1000);
    await snap('2026-10', 14, 1, 2, 3, null); // not scored yet
    await snap('2026-05', 14, 1, 2, 3, 0); // no spending: not scored
    await seedUser(OTHER);
    await snap('2026-09', 14, 1, 2, 3, 1000, OTHER);

    const body = await (await get()).json<ForecastAccuracyResponse>();
    expect(body).toEqual({
      months: [
        { year: 2026, month: 9, errorPct: 6, covered: true },
        { year: 2026, month: 7, errorPct: 20, covered: false },
        { year: 2026, month: 6, errorPct: 0, covered: true },
      ],
    });
  });

  it('feeds the forecast\'s accuracy line from the previous month, and only then', async () => {
    setNow(day('2026-10-22'));
    await seedSwiggy(day('2026-10-22'));
    const forecast = async () => (await (await call(`/api/v1/forecast?year=2026&month=10&timezone=${encodeURIComponent(IST)}`)).json<ForecastResponse>()).accuracy;
    expect(await forecast()).toBeNull();
    await snap('2026-08', 14, 900, 1000, 1100, 1000);
    expect(await forecast()).toBeNull(); // August is not last month
    await snap('2026-09', 14, 1000, 1034, 1100, 1000);
    expect(await forecast()).toEqual({ lastMonthErrorPct: 3.4 });
    const past = await (await call(`/api/v1/forecast?year=2026&month=9&timezone=${encodeURIComponent(IST)}`)).json<ForecastResponse>();
    expect(past.accuracy).toBeNull();
  });
});

describe('forecastFlexibleAsOf', () => {
  const HOUR = 3_600_000;
  /** Rs 100 on every local day from `fromMs` for `days` days, noon IST. */
  const dailyRows = (fromMs: number, days: number, rupees = 100): EngineTxRow[] =>
    Array.from({ length: days }, (_, i) => ({
      id: `d${i}`,
      amount: rupees * 100,
      type: 'debit' as const,
      transaction_at: new Date(fromMs + i * DAY + 6.5 * HOUR).toISOString(),
      category_id: null,
      payee_key: 'shop',
      counterparty_name: 'Shop',
      counterparty_type: 'merchant',
      recurring_item_id: null,
      scope: 'spend',
      one_off: 0,
    }));
  const START = Date.parse('2026-07-01T00:00:00.000Z') - 5.5 * HOUR; // local midnight 2026-07-01 in Kolkata
  const ASOF = Date.parse('2026-10-14T00:00:00.000Z') - 5.5 * HOUR;
  const asOf = (rows: EngineTxRow[], over: { windowDays?: number; widthFactor?: number } = {}) =>
    forecastFlexibleAsOf(rows, IST, ASOF, '2026-10-31', { windowDays: 90, widthFactor: 1, rng: mulberry32(7), ...over });

  it('ignores everything after the as-of instant', () => {
    const known = dailyRows(START, 105); // through 2026-10-13
    const future: EngineTxRow[] = dailyRows(ASOF + 1000, 18, 50_000).map((r, i) => ({ ...r, id: `f${i}`, payee_key: 'later' }));
    const without = asOf(known);
    expect(asOf([...known, ...future])).toEqual(without);
    expect(without.mode).toBe('full');
    // 18 remaining days (the 14th to the 31st) of Rs 100 each, on an even history: a tight range around Rs 1800.
    expect(without.p50).toBe(180_000);
    expect(without.p10).toBe(180_000);
    expect(without.p90).toBe(180_000);
    // ... while rows before it count.
    expect(asOf(dailyRows(START, 105, 200))).toMatchObject({ p50: 360_000 });
  });

  it('widens the range with the width factor and honours the window', () => {
    // Alternating Rs 0 / Rs 200 days give a real spread.
    const rows = dailyRows(START, 105).filter((_, i) => i % 2 === 0).map((r) => ({ ...r, amount: 20_000 }));
    const narrow = asOf(rows);
    const wide = asOf(rows, { widthFactor: 2 });
    expect(wide.p90 - wide.p10).toBeGreaterThan(narrow.p90 - narrow.p10);
    const recent = [...dailyRows(START, 60, 1000), ...dailyRows(START + 60 * DAY, 45, 100)];
    expect(asOf(recent, { windowDays: 120 }).p50).toBeGreaterThan(asOf(recent, { windowDays: 60 }).p50);
  });

  it('gives the same range the live forecast shows (same rows, same seed)', async () => {
    const now = day('2026-10-22');
    setNow(now);
    await seedSwiggy(now);
    for (const [i, rupees] of [300, 80, 450, 120, 60, 900].entries()) await seedTransaction({ amount: String(rupees), counterparty_name: `Shop ${i}`, transaction_at: new Date(now - (2 + i * 9) * DAY).toISOString() });
    await runEngineForUser(makeEnv(), USER_ID, now);
    const live = await (await call(`/api/v1/forecast?year=2026&month=10&timezone=${encodeURIComponent(IST)}`)).json<ForecastResponse>();
    const rows = await loadEngineRows(testDb(), USER_ID, IST, now);
    const replay = forecastFlexibleAsOf(rows, IST, now, '2026-10-31', { windowDays: 90, widthFactor: 1, rng: mulberry32(hashSeed(`${USER_ID}:2026-10-22`)) });
    expect(replay.p50 / 100).toBeCloseTo(Number(live.landing.flexibleRemaining), 2);
    expect(detectCadences(rows, IST).length).toBeGreaterThan(0);
  });
});

describe('replay: nothing from after the as-of day', () => {
  const HOUR = 3_600_000;
  const START = Date.parse('2026-04-01T00:00:00.000Z') - 5.5 * HOUR;
  const row = (i: number, ms: number, rupees: number, over: Partial<EngineTxRow> = {}): EngineTxRow => ({
    id: `r${i}`,
    amount: rupees * 100,
    type: 'debit',
    transaction_at: new Date(ms).toISOString(),
    category_id: null,
    payee_key: 'shop',
    counterparty_name: 'Shop',
    counterparty_type: 'merchant',
    recurring_item_id: null,
    scope: 'spend',
    one_off: 0,
    ...over,
  });
  /** Rs 100 a day from 2026-04-01 through 2026-09-30, noon IST. */
  const history = () => Array.from({ length: 183 }, (_, i) => row(i, START + i * DAY + 6.5 * HOUR, 100));

  it('forecasts the same whatever happens after the day, and scores against what happened', () => {
    const opts = { windowDays: 90, widthFactor: 1, seed: 'u' };
    const base = replayMonth(history(), IST, 2026, 9, [7, 14], opts);
    // A huge spend on the 20th, and bills after the 14th: invisible to the day-7 and day-14 forecasts of what is to come.
    const later = [...history(), row(900, Date.parse('2026-09-20T06:30:00.000Z'), 90_000), row(901, Date.parse('2026-09-25T06:30:00.000Z'), 5_000, { recurring_item_id: 'bill' })];
    const withFuture = replayMonth(later, IST, 2026, 9, [7, 14], opts);
    expect(withFuture.map((p) => p.flexible)).toEqual(base.map((p) => p.flexible));
    expect(withFuture[0]?.actualFlexibleRemaining).toBe((base[0]?.actualFlexibleRemaining as number) + 9_000_000);
    expect(withFuture[0]?.actualTotal).toBe((base[0]?.actualTotal as number) + 9_500_000);
    // ... and rows before the day do change it.
    const earlier = history().map((r, i) => (i >= 125 && i <= 165 ? { ...r, amount: 100_000 } : r)); // 2026-08-03 to 2026-09-12: Rs 1000 a day
    expect(replayMonth(earlier, IST, 2026, 9, [14], opts)[0]?.flexible.p50).toBeGreaterThan(base[1]?.flexible.p50 as number);
  });
});

describe('the month-end actual is the number the forecast counted', () => {
  it('equals the spentSoFar of the forecast and the debit total of the month summary, bills, self transfers and credits included', async () => {
    const now = day('2026-11-02');
    await seedSwiggy(now);
    await seedTransaction({ amount: '12345.67', counterparty_name: 'Croma', transaction_at: '2026-10-30T10:00:00.000Z' });
    await seedTransaction({ amount: '700', counterparty_name: 'My Savings', counterparty_type: 'self_transfer', transaction_at: '2026-10-29T10:00:00.000Z' });
    await seedTransaction({ amount: '649', counterparty_name: 'Netflix', transaction_at: '2026-10-05T10:00:00.000Z', recurring_item_id: null });
    await seedTransaction({ amount: '500', type: 'credit', counterparty_name: 'Acme', transaction_at: '2026-10-28T10:00:00.000Z' });
    await runEngineForUser(makeEnv(), USER_ID, now);
    await snap('2026-10', 14, 1, 2, 3, null);
    await runScoring(makeEnv(), USER_ID, now);
    const actual = (await snapshots())[0]?.['actual'] as number;

    setNow(day('2026-10-31'));
    const body = await (await call(`/api/v1/forecast?year=2026&month=10&timezone=${encodeURIComponent(IST)}`)).json<ForecastResponse>();
    const summary = await (await call(`/api/v1/transactions/month-summary?year=2026&month=10&timezone=${encodeURIComponent(IST)}`)).json<{ debit_total: string }>();
    expect(actual / 100).toBe(Number(summary.debit_total));
    expect(Number(body.landing.spentSoFar)).toBe(Number(summary.debit_total));
    expect(actual).toBeGreaterThan(1_234_567 + 70_000);
  });
});
