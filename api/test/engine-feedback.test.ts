import { afterEach, describe, expect, it, vi } from 'vitest';

import { emptyUsage } from '../src/features/agent/llm';
import type { LlmClient, LlmRequest } from '../src/features/agent/llm';
import { runEngineForUser } from '../src/features/engine/job';
import { runLabeller } from '../src/features/engine/labeller';
import type { ForecastResponse } from '../src/features/engine/schemas';
import { USER_ID, call, makeEnv } from './helpers';
import { oneRow, rowsOf, seedCategory, seedCategoryBudget, seedTransaction, seedUser, testDb } from './db';

const DAY = 86_400_000;
/** Thursday 2026-10-22, 03:00 UTC (08:30 IST). */
const NOW = Date.parse('2026-10-22T03:00:00.000Z');
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const IST = 'Asia/Kolkata';
const OTHER = '22222222-2222-2222-2222-222222222222';

afterEach(() => vi.useRealTimers());

const setNow = (ms: number) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ms);
};

const post = (json: unknown, opts: Parameters<typeof call>[1] = {}) => call('/api/v1/predictions/feedback', { method: 'POST', json, ...opts });
const send = (targetKind: string, targetId: string, verdict: string, extra: Record<string, unknown> = {}) => post({ targetKind, targetId, verdict, ...extra });
const forecast = async () => {
  const res = await call(`/api/v1/forecast?year=2026&month=10&timezone=${encodeURIComponent(IST)}`);
  expect(res.status).toBe(200);
  return res.json<ForecastResponse>();
};
const pattern = (key: string, userId = USER_ID) =>
  oneRow<{ kind: string; kind_source: string; alpha: number; beta: number; suppressed: number }>('payee_patterns', 'user_id = ? AND payee_key = ?', userId, key);
const feedbackRows = () => rowsOf<Record<string, unknown>>('prediction_feedback');
const labelOf = (id: string) => oneRow<{ one_off: number; source: string; user_id: string }>('txn_labels', 'transaction_id = ?', id);

/** Swiggy (food) every 4 days for 80 days, a Netflix subscription candidate, six Croma purchases and a Rs 4,000 one yesterday. */
async function seedWorld(userId = USER_ID) {
  const food = await seedCategory({ name: `Food ${userId.slice(0, 2)}`, user_id: userId });
  for (let ago = 3; ago <= 79; ago += 4) await seedTransaction({ user_id: userId, amount: '200', counterparty_name: 'Swiggy', category_id: food, transaction_at: at(ago) });
  for (const d of ['2026-08-05', '2026-09-05', '2026-10-05']) await seedTransaction({ user_id: userId, amount: '649', counterparty_name: 'Netflix', transaction_at: `${d}T04:00:00.000Z` });
  for (const [i, rupees] of [1000, 1100, 900, 1050, 950, 1000].entries()) await seedTransaction({ user_id: userId, amount: String(rupees), counterparty_name: 'Croma', transaction_at: at(30 + i) });
  const croma = await seedTransaction({ user_id: userId, amount: '4000', counterparty_name: 'Croma', transaction_at: at(1) });
  await seedCategoryBudget(food, '100', userId);
  await runEngineForUser(makeEnv(), userId, NOW);
  return { food, croma };
}

describe('POST /api/v1/predictions/feedback: request handling', () => {
  it('needs a signed-in user', async () => {
    expect((await post({ targetKind: 'payee', targetId: 'x', verdict: 'confirm' }, { token: false })).status).toBe(401);
  });

  it('rejects a verdict the kind does not take, an unknown kind and a bad target id (422)', async () => {
    const bad = await send('category_watch', 'x', 'confirm');
    expect(bad.status).toBe(422);
    expect(JSON.stringify(await bad.json())).toContain('verdict');
    expect((await send('unusual_txn', 'x', 'confirm')).status).toBe(422);
    expect((await send('payee', 'x', 'one_off')).status).toBe(422);
    expect((await send('payee_merge', 'x', 'confirm')).status).toBe(422);
    expect((await send('weather', 'x', 'confirm')).status).toBe(422);
    expect((await send('payee', '', 'confirm')).status).toBe(422);
    expect((await send('payee', 'x'.repeat(201), 'confirm')).status).toBe(422);
    expect((await post({ targetKind: 'payee', verdict: 'confirm' })).status).toBe(422);
    expect(await feedbackRows()).toHaveLength(0);
  });

  it('is behind the write rate limit', async () => {
    await seedWorld();
    expect((await send('payee', 'swiggy', 'confirm')).status).toBe(204); // no limiter bound: not throttled
    const env = makeEnv({ WRITE_LIMITER: { limit: () => Promise.resolve({ success: false }) } });
    expect((await post({ targetKind: 'payee', targetId: 'swiggy', verdict: 'confirm' }, { env })).status).toBe(429);
    expect(await pattern('swiggy')).toMatchObject({ alpha: 4.8 });
    expect(await feedbackRows()).toHaveLength(1);
  });

  it('answers 422 for a prediction that is not there', async () => {
    await seedWorld();
    const res = await send('payee', 'nobody', 'confirm');
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail: 'Unknown prediction.' });
    expect((await send('subscription_candidate', 'nobody', 'confirm')).status).toBe(422);
    expect((await send('unusual_txn', '00000000-0000-4000-8000-0000000000ff', 'one_off')).status).toBe(422);
    expect((await send('category_watch', '00000000-0000-4000-8000-0000000000ff', 'dismiss')).status).toBe(422);
    expect((await send('payee_merge', 'swiggy', 'dismiss')).status).toBe(422); // not merged
    expect(await feedbackRows()).toHaveLength(0);
  });
});

describe('POST /api/v1/predictions/feedback: payee', () => {
  it('confirm adds 3 to alpha, after the old evidence has decayed', async () => {
    await seedWorld();
    expect(await pattern('swiggy')).toMatchObject({ alpha: 2, beta: 1, suppressed: 0 });
    const res = await send('payee', 'swiggy', 'confirm');
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(await pattern('swiggy')).toMatchObject({ alpha: 4.8, beta: 0.9 });
    expect(await feedbackRows()).toMatchObject([{ user_id: USER_ID, target_kind: 'payee', target_id: 'swiggy', verdict: 'confirm', month: '' }]);
  });

  it('is idempotent: the same verdict again changes nothing, so a replay cannot inflate confidence', async () => {
    const { croma } = await seedWorld();
    for (let i = 0; i < 5; i++) expect((await send('payee', 'swiggy', 'confirm')).status).toBe(204);
    expect(await pattern('swiggy')).toMatchObject({ alpha: 4.8, beta: 0.9 });
    expect(await feedbackRows()).toHaveLength(1);

    for (let i = 0; i < 3; i++) expect((await send('unusual_txn', croma, 'one_off')).status).toBe(204);
    expect(await feedbackRows()).toHaveLength(2);
    // A different verdict is a real change: it applies, and replaces the stored answer.
    expect((await send('unusual_txn', croma, 'not_one_off')).status).toBe(204);
    expect(await labelOf(croma)).toMatchObject({ one_off: 0, source: 'user' });
    expect(await feedbackRows()).toHaveLength(2);
    expect((await feedbackRows()).find((r) => r['target_kind'] === 'unusual_txn')).toMatchObject({ verdict: 'not_one_off' });

    // A merge can be undone once; asking again is not an error and not a second undo.
    await testDb().prepare('UPDATE engine_patterns SET payee_merges = ? WHERE user_id = ?').bind(JSON.stringify({ a: 'b' }), USER_ID).run();
    expect((await send('payee_merge', 'a', 'dismiss')).status).toBe(204);
    expect((await send('payee_merge', 'a', 'dismiss')).status).toBe(204);
    expect((await feedbackRows()).filter((r) => r['target_kind'] === 'payee_merge')).toHaveLength(1);
  });

  it('a category dismissed in two months is two answers, one per month', async () => {
    setNow(Date.parse('2026-10-20T03:00:00.000Z'));
    const food = await seedCategory({ name: 'Food' });
    expect((await send('category_watch', food, 'dismiss')).status).toBe(204);
    expect((await send('category_watch', food, 'dismiss')).status).toBe(204);
    setNow(Date.parse('2026-11-20T03:00:00.000Z'));
    expect((await send('category_watch', food, 'dismiss')).status).toBe(204);
    expect((await feedbackRows()).map((r) => r['month'])).toEqual(['2026-10', '2026-11']);
  });

  it('dismiss suppresses the payee, so it is no longer predicted, and a rebuild keeps it so', async () => {
    setNow(NOW);
    await seedWorld();
    expect((await forecast()).upcoming.some((u) => u.payeeKey === 'swiggy')).toBe(true);
    expect((await send('payee', 'swiggy', 'dismiss')).status).toBe(204);
    expect(await pattern('swiggy')).toMatchObject({ suppressed: 1 });
    expect((await forecast()).upcoming.some((u) => u.payeeKey === 'swiggy')).toBe(false);
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect(await pattern('swiggy')).toMatchObject({ suppressed: 1 });
  });
});

describe('POST /api/v1/predictions/feedback: subscription_candidate', () => {
  it('confirm makes it a subscription by the user\'s word, with alpha + 3, and a rebuild keeps that', async () => {
    await seedWorld();
    await testDb().prepare("UPDATE payee_patterns SET kind = 'habit', kind_source = 'llm' WHERE payee_key = 'netflix'").run();
    expect((await send('subscription_candidate', 'netflix', 'confirm')).status).toBe(204);
    expect(await pattern('netflix')).toMatchObject({ kind: 'subscription', kind_source: 'user', alpha: 4.8, beta: 0.9 });
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect(await pattern('netflix')).toMatchObject({ kind: 'subscription', kind_source: 'user', alpha: 4.8 });
  });

  it('dismiss means "not a subscription": a habit, kept through rebuilds, and the card is gone', async () => {
    setNow(NOW);
    await seedWorld();
    expect((await forecast()).watch.some((w) => w.id === 'sub:netflix')).toBe(true);
    expect((await send('subscription_candidate', 'netflix', 'dismiss')).status).toBe(204);
    expect(await pattern('netflix')).toMatchObject({ kind: 'habit', kind_source: 'user' });
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect(await pattern('netflix')).toMatchObject({ kind: 'habit', kind_source: 'user' });
    expect((await forecast()).watch.some((w) => w.id === 'sub:netflix')).toBe(false);
  });

  it('is not for an income payee', async () => {
    await seedWorld();
    await testDb().prepare("UPDATE payee_patterns SET kind = 'income' WHERE payee_key = 'netflix'").run();
    expect((await send('subscription_candidate', 'netflix', 'confirm')).status).toBe(422);
  });
});

describe('POST /api/v1/predictions/feedback: unusual_txn', () => {
  it('one_off writes the user\'s label over the model\'s and rebuilds the profile', async () => {
    const { croma } = await seedWorld();
    await testDb().prepare("INSERT INTO txn_labels (transaction_id, user_id, one_off, source, labelled_at) VALUES (?, ?, 0, 'llm', ?)").bind(croma, USER_ID, at(0)).run();
    await testDb().prepare('UPDATE engine_patterns SET dirty = 0').run();
    expect((await send('unusual_txn', croma, 'one_off')).status).toBe(204);
    expect(await labelOf(croma)).toMatchObject({ one_off: 1, source: 'user', user_id: USER_ID });
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ dirty: 1 });
  });

  it('not_one_off writes one_off = 0 over a model\'s one-off label, and hides the card', async () => {
    setNow(NOW);
    const { croma } = await seedWorld();
    expect((await forecast()).watch.some((w) => w.id === `unusual:${croma}`)).toBe(true);
    await testDb().prepare("INSERT INTO txn_labels (transaction_id, user_id, one_off, source, labelled_at) VALUES (?, ?, 1, 'llm', ?)").bind(croma, USER_ID, at(0)).run();
    expect((await send('unusual_txn', croma, 'not_one_off')).status).toBe(204);
    expect(await labelOf(croma)).toMatchObject({ one_off: 0, source: 'user' });
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect((await forecast()).watch.some((w) => w.id === `unusual:${croma}`)).toBe(false);
  });

  it('one_off hides the card too: the user has answered it', async () => {
    setNow(NOW);
    const { croma } = await seedWorld();
    expect((await forecast()).watch.some((w) => w.id === `unusual:${croma}`)).toBe(true);
    expect((await send('unusual_txn', croma, 'one_off')).status).toBe(204);
    expect(await labelOf(croma)).toMatchObject({ one_off: 1, source: 'user' });
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect((await forecast()).watch.some((w) => w.id === `unusual:${croma}`)).toBe(false);
  });

  it('dismiss only hides the card, with no label', async () => {
    setNow(NOW);
    const { croma } = await seedWorld();
    expect((await send('unusual_txn', croma, 'dismiss')).status).toBe(204);
    expect(await labelOf(croma)).toBeNull();
    expect((await forecast()).watch.some((w) => w.id === `unusual:${croma}`)).toBe(false);
  });

  it('is not for a deleted transaction', async () => {
    const { croma } = await seedWorld();
    await testDb().prepare('UPDATE transactions SET deleted_at = ? WHERE id = ?').bind(at(0), croma).run();
    expect((await send('unusual_txn', croma, 'one_off')).status).toBe(422);
  });
});

describe('POST /api/v1/predictions/feedback: category_watch', () => {
  it('hides a running-hot category for the month it was dismissed in, and keeps the user\'s local month', async () => {
    setNow(NOW);
    const { food } = await seedWorld();
    expect((await forecast()).watch.some((w) => w.id === `hot:${food}`)).toBe(true);
    expect((await send('category_watch', food.toUpperCase(), 'dismiss', { timezone: IST })).status).toBe(204);
    expect(await feedbackRows()).toMatchObject([{ target_kind: 'category_watch', target_id: food, verdict: 'dismiss', month: '2026-10' }]);
    expect((await forecast()).watch.some((w) => w.id === `hot:${food}`)).toBe(false);
  });

  it('a dismissal from an earlier month no longer hides it', async () => {
    setNow(NOW);
    const { food } = await seedWorld();
    await testDb().prepare("INSERT INTO prediction_feedback (id, user_id, target_kind, target_id, verdict, month, created_at) VALUES ('f1', ?, 'category_watch', ?, 'dismiss', '2026-09', ?)").bind(USER_ID, food, at(30)).run();
    expect((await forecast()).watch.some((w) => w.id === `hot:${food}`)).toBe(true);
    await testDb().prepare("UPDATE prediction_feedback SET month = '2026-10'").run();
    expect((await forecast()).watch.some((w) => w.id === `hot:${food}`)).toBe(false);
  });

  it('takes the month from the requested timezone', async () => {
    // 2026-10-31 20:00 UTC: already November 1 in Kolkata, still October 31 in Los Angeles.
    setNow(Date.parse('2026-10-31T20:00:00.000Z'));
    const food = await seedCategory({ name: 'Food' });
    expect((await send('category_watch', food, 'dismiss', { timezone: 'America/Los_Angeles' })).status).toBe(204);
    expect((await send('category_watch', food, 'dismiss')).status).toBe(204);
    expect((await feedbackRows()).map((r) => r['month'])).toEqual(['2026-10', '2026-11']);
    expect((await send('category_watch', food, 'dismiss', { timezone: 'Not/AZone' })).status).toBe(400);
  });
});

describe('POST /api/v1/predictions/feedback: payee_merge', () => {
  it('dismiss undoes the merge, remembers the pair as rejected and marks the profile dirty', async () => {
    await seedWorld();
    await testDb().prepare("UPDATE engine_patterns SET payee_merges = ?, dirty = 0 WHERE user_id = ?").bind(JSON.stringify({ 'swiggy instamart': 'swiggy' }), USER_ID).run();
    expect((await send('payee_merge', 'swiggy instamart', 'dismiss')).status).toBe(204);
    const row = await oneRow<{ payee_merges: string; merge_rejects: string; dirty: number }>('engine_patterns', 'user_id = ?', USER_ID);
    expect(JSON.parse(row!.payee_merges)).toEqual({});
    expect(JSON.parse(row!.merge_rejects)).toEqual(['swiggy|swiggy instamart']);
    expect(row!.dirty).toBe(1);
    expect(await feedbackRows()).toMatchObject([{ target_kind: 'payee_merge', target_id: 'swiggy instamart', verdict: 'dismiss' }]);
  });
});

describe('POST /api/v1/predictions/feedback: only the user\'s own predictions', () => {
  it('cannot touch another user\'s payee, transaction, category or merge', async () => {
    await seedUser(OTHER);
    const { food, croma } = await seedWorld(OTHER);
    await testDb().prepare('UPDATE engine_patterns SET payee_merges = ? WHERE user_id = ?').bind(JSON.stringify({ a: 'b' }), OTHER).run();
    const before = await pattern('swiggy', OTHER);
    const netflix = await pattern('netflix', OTHER);

    for (const [kind, id, verdict] of [
      ['payee', 'swiggy', 'dismiss'],
      ['payee', 'swiggy', 'confirm'],
      ['subscription_candidate', 'netflix', 'confirm'],
      ['subscription_candidate', 'netflix', 'dismiss'],
      ['unusual_txn', croma, 'one_off'],
      ['category_watch', food, 'dismiss'],
      ['payee_merge', 'a', 'dismiss'],
    ] as const) {
      expect((await send(kind, id, verdict)).status).toBe(422);
    }
    expect(await pattern('swiggy', OTHER)).toEqual(before);
    expect(await pattern('netflix', OTHER)).toEqual(netflix);
    expect(await labelOf(croma)).toBeNull();
    expect(JSON.parse((await oneRow<{ payee_merges: string }>('engine_patterns', 'user_id = ?', OTHER))!.payee_merges)).toEqual({ a: 'b' });
    expect(await feedbackRows()).toHaveLength(0);
  });
});

describe('POST /api/v1/predictions/feedback: both users have the same payee', () => {
  it('changes only the row of the user who sent it', async () => {
    await seedUser(OTHER);
    await seedWorld(OTHER);
    await seedWorld();
    const theirs = await pattern('swiggy', OTHER);
    expect((await send('payee', 'swiggy', 'dismiss')).status).toBe(204);
    expect(await pattern('swiggy')).toMatchObject({ suppressed: 1 });
    expect(await pattern('swiggy', OTHER)).toEqual(theirs);
    expect((await send('payee', 'swiggy', 'confirm')).status).toBe(204);
    expect(await pattern('swiggy', OTHER)).toEqual(theirs);
    expect(await rowsOf('prediction_feedback', 'user_id = ?', OTHER)).toHaveLength(0);
  });
});

describe('the labeller never overrides the user', () => {
  const recording = () => {
    const requests: LlmRequest[] = [];
    const llm: LlmClient = (request) => {
      requests.push(request);
      const data = JSON.parse((request.messages[1] as { content: string }).content) as { oneOff?: Array<{ id: string }>; subs?: Array<{ id: string }> };
      return Promise.resolve({
        model: request.model,
        content: JSON.stringify({
          oneOff: data.oneOff?.map((o) => ({ id: o.id, oneOff: true })),
          subs: data.subs?.map((s) => ({ id: s.id, kind: 'subscription' })),
        }),
        toolCalls: [],
        finishReason: 'stop',
        usage: { ...emptyUsage(), promptTokens: 100, completionTokens: 50 },
        ms: 1,
      });
    };
    return { llm, data: (i = 0) => JSON.parse((requests[i]?.messages[1] as { content: string }).content) as { oneOff?: unknown[]; subs?: unknown[] } };
  };

  it('does not ask about, or change, a transaction the user labelled or a payee whose kind the user chose', async () => {
    const { croma } = await seedWorld();
    for (const ago of [10, 40, 70, 100]) await seedTransaction({ amount: '119', counterparty_name: 'Spotify', transaction_at: at(ago) });
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect(await pattern('spotify')).toMatchObject({ kind: 'subscription' });
    await send('unusual_txn', croma, 'not_one_off');
    await send('subscription_candidate', 'spotify', 'dismiss'); // "not a subscription": a habit, by the user's word
    await send('subscription_candidate', 'netflix', 'dismiss');

    const ai = recording();
    await runLabeller(makeEnv({ ENGINE_LLM_ENABLED: 'true', DEEPSEEK_API_KEY: 'sk-test' }), USER_ID, NOW, ai.llm);
    expect(ai.data().oneOff).toBeUndefined();
    expect(ai.data().subs).toBeUndefined();
    expect(await labelOf(croma)).toMatchObject({ one_off: 0, source: 'user' });
    expect(await pattern('spotify')).toMatchObject({ kind: 'habit', kind_source: 'user' });

    // Even if an answer arrived anyway (a stale batch), the writes ignore user decisions.
    await testDb().prepare("UPDATE payee_patterns SET kind_source = 'user' WHERE payee_key = 'spotify'").run();
    await testDb().prepare("INSERT OR IGNORE INTO txn_labels (transaction_id, user_id, one_off, source, labelled_at) VALUES (?, ?, 1, 'llm', ?)").bind(croma, USER_ID, at(0)).run();
    expect(await labelOf(croma)).toMatchObject({ one_off: 0, source: 'user' });
  });
});
