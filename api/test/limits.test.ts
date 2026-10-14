import { describe, expect, it } from 'vitest';

import { claimQuestion, refundQuestion } from '../src/features/agent/usage';
import { addNeurons, claimCapture } from '../src/features/ai/neuron-cap';
import { USER_ID, call, makeEnv, signToken } from './helpers';
import { seedUser, testDb } from './db';

const OTHER = '22222222-2222-2222-2222-222222222222';

interface Limit {
  used: number;
  limit: number;
  remaining: number;
}
interface LimitsBody {
  resets_at: string;
  agent_questions: Limit;
  receipt_scans: Limit;
  voice_captures: Limit;
  scanning_paused: boolean;
}

const get = async (over: Parameters<typeof call>[1] = {}) => {
  const res = await call('/api/v1/limits', over);
  return { res, body: await res.json<LimitsBody>() };
};

describe('GET /limits', () => {
  it('401 without a token', async () => {
    expect((await call('/api/v1/limits', { token: false })).status).toBe(401);
  });

  it('a fresh day: nothing used, the configured limits, next UTC midnight, no-store', async () => {
    const { res, body } = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(body).toEqual({
      resets_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/) as string,
      agent_questions: { used: 0, limit: 5, remaining: 5 },
      receipt_scans: { used: 0, limit: 10, remaining: 10 },
      voice_captures: { used: 0, limit: 10, remaining: 10 },
      scanning_paused: false,
    });
    const reset = Date.parse(body.resets_at);
    expect(reset).toBeGreaterThan(Date.now());
    expect(reset - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000);
  });

  it('counts per kind and per user; the vars set the limits; remaining never goes below 0', async () => {
    const now = Date.now();
    await seedUser(OTHER);
    for (let i = 0; i < 3; i++) await claimCapture(testDb(), USER_ID, 'receipt', now, 10);
    await claimCapture(testDb(), USER_ID, 'voice', now, 10);
    await claimQuestion(testDb(), USER_ID, now, 5);
    await claimQuestion(testDb(), USER_ID, now, 5);
    await claimCapture(testDb(), OTHER, 'receipt', now, 10);

    const mine = (await get({ env: makeEnv({ AI_USER_DAILY_RECEIPTS: '2', AGENT_DAILY_QUESTIONS: '8', AI_USER_DAILY_VOICE: '4' }) })).body;
    expect(mine.receipt_scans).toEqual({ used: 3, limit: 2, remaining: 0 });
    expect(mine.voice_captures).toEqual({ used: 1, limit: 4, remaining: 3 });
    expect(mine.agent_questions).toEqual({ used: 2, limit: 8, remaining: 6 });

    const theirs = (await get({ token: await signToken({ sub: OTHER }) })).body;
    expect(theirs.receipt_scans.used).toBe(1);
    expect(theirs.voice_captures.used).toBe(0);
    expect(theirs.agent_questions.used).toBe(0);
  });

  it('scanning_paused follows the global neuron cap', async () => {
    await addNeurons(testDb(), Date.now(), 7000);
    expect((await get()).body.scanning_paused).toBe(false);
    await addNeurons(testDb(), Date.now(), 900);
    expect((await get()).body.scanning_paused).toBe(true);
    expect((await get({ env: makeEnv({ AI_DAILY_NEURON_CAP: '100000' }) })).body.scanning_paused).toBe(false);
  });
});

describe('refundQuestion', () => {
  it('gives one question back for the claim day and never goes below zero', async () => {
    const now = Date.parse('2026-10-05T23:59:59Z');
    await claimQuestion(testDb(), USER_ID, now, 5);
    await claimQuestion(testDb(), USER_ID, now, 5);
    await refundQuestion(testDb(), USER_ID, now);
    const day = (d: string) => testDb().prepare('SELECT turns FROM agent_usage WHERE user_id = ? AND day = ?').bind(USER_ID, d).first<{ turns: number }>();
    expect((await day('2026-10-05'))?.turns).toBe(1);
    await refundQuestion(testDb(), USER_ID, now);
    await refundQuestion(testDb(), USER_ID, now);
    expect((await day('2026-10-05'))?.turns).toBe(0);
    // A refund for a day with no claim is a no-op.
    await refundQuestion(testDb(), USER_ID, Date.parse('2026-10-06T00:00:01Z'));
    expect(await day('2026-10-06')).toBeNull();
  });
});
