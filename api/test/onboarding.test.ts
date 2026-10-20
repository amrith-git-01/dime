import { describe, expect, it } from 'vitest';

import migration0009 from '../migrations/0009_onboarding_progress.sql?raw';
import { USER_ID, call, signToken } from './helpers';
import { seedBudget, seedCategory, seedCategoryBudget, seedTransaction, seedUser, testDb, uid } from './db';

const OTHER = '22222222-2222-2222-2222-222222222222';
const NONE = { first_expense: false, voice_or_scan: false, budget: false, recurring: false, asked_ai: false };

async function progress(userId: string = USER_ID) {
  const res = await call('/api/v1/me/onboarding-progress', { token: await signToken({ sub: userId }) });
  expect(res.status).toBe(200);
  return res.json();
}

async function seedRecurring(userId: string = USER_ID): Promise<string> {
  const id = uid();
  await testDb()
    .prepare(
      `INSERT INTO recurring_items (id, user_id, kind, name, amount, category_id, cadence, day_of_month, month_of_year, timezone, next_due_date, active, note)
       VALUES (?, ?, 'subscription', 'Netflix', 64900, NULL, 'monthly', 5, NULL, 'Asia/Kolkata', '2026-11-05', 1, NULL)`,
    )
    .bind(id, userId)
    .run();
  return id;
}

describe('GET /me/onboarding-progress', () => {
  it('returns 401 without a token', async () => {
    const res = await call('/api/v1/me/onboarding-progress', { token: false });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: 'Not authenticated.' });
  });

  it('is all false for a new account', async () => {
    expect(await progress()).toEqual(NONE);
  });

  it('first_expense turns true for a manual debit', async () => {
    await seedTransaction({ type: 'debit' });
    expect(await progress()).toEqual({ ...NONE, first_expense: true });
  });

  it('income, deleted rows and recurring postings are not a first expense', async () => {
    await seedTransaction({ type: 'credit' });
    await seedTransaction({ type: 'debit', deleted_at: '2026-10-05T00:00:00.000Z' });
    const item = await seedRecurring();
    await seedTransaction({ type: 'debit', recurring_item_id: item });
    expect(await progress()).toEqual({ ...NONE, recurring: true });
    await seedTransaction({ type: 'debit', detected_via: 'sms' });
    expect(await progress()).toMatchObject({ first_expense: true });
  });

  it('voice_or_scan needs a live voice or scan transaction', async () => {
    await seedTransaction({ detected_via: 'sms' });
    await seedTransaction({ detected_via: 'voice', deleted_at: '2026-10-05T00:00:00.000Z' });
    expect(await progress()).toMatchObject({ voice_or_scan: false });
    await seedTransaction({ detected_via: 'scan' });
    expect(await progress()).toMatchObject({ voice_or_scan: true });
  });

  it('a voice entry on its own is also a first expense', async () => {
    await seedTransaction({ detected_via: 'voice' });
    expect(await progress()).toEqual({ ...NONE, first_expense: true, voice_or_scan: true });
  });

  it('a zero monthly budget does not count, a positive one does', async () => {
    await seedBudget({ monthly: '0' });
    expect(await progress()).toMatchObject({ budget: false });
    await testDb().prepare('UPDATE budgets SET monthly_budget = 2500000 WHERE user_id = ?').bind(USER_ID).run();
    expect(await progress()).toMatchObject({ budget: true });
  });

  it('a category budget counts as a budget', async () => {
    const category = await seedCategory({ name: 'Snacks' });
    await seedCategoryBudget(category, '1500');
    expect(await progress()).toMatchObject({ budget: true });
  });

  it('any recurring item counts, active or not', async () => {
    const id = await seedRecurring();
    await testDb().prepare('UPDATE recurring_items SET active = 0 WHERE id = ?').bind(id).run();
    expect(await progress()).toMatchObject({ recurring: true });
  });

  it('asked_ai comes from users.first_agent_question_at', async () => {
    expect(await progress()).toMatchObject({ asked_ai: false });
    await testDb().prepare("UPDATE users SET first_agent_question_at = '2026-10-05T00:00:00.000Z' WHERE id = ?").bind(USER_ID).run();
    expect(await progress()).toEqual({ ...NONE, asked_ai: true });
  });

  it("never reports another user's data", async () => {
    await seedUser(OTHER);
    await seedTransaction({ user_id: OTHER, detected_via: 'voice' });
    await seedBudget({ user_id: OTHER, monthly: '9000' });
    await seedRecurring(OTHER);
    await testDb().prepare("UPDATE users SET first_agent_question_at = '2026-10-05T00:00:00.000Z' WHERE id = ?").bind(OTHER).run();
    expect(await progress()).toEqual(NONE);
    expect(await progress(OTHER)).toEqual({ first_expense: true, voice_or_scan: true, budget: true, recurring: true, asked_ai: true });
  });
});

describe('migration 0009 backfill', () => {
  it('stamps users at their first day with turns > 0 and leaves the rest empty', async () => {
    const db = testDb();
    const THIRD = '33333333-3333-3333-3333-333333333333';
    await seedUser(OTHER);
    await seedUser(THIRD);
    const usage = (user: string, day: string, turns: number) => db.prepare('INSERT INTO agent_usage (user_id, day, turns) VALUES (?, ?, ?)').bind(user, day, turns).run();
    await usage(USER_ID, '2026-10-03', 0); // claimed then refunded
    await usage(USER_ID, '2026-10-06', 2);
    await usage(USER_ID, '2026-10-04', 1);
    await usage(OTHER, '2026-10-02', 0);
    await db.prepare('UPDATE users SET first_agent_question_at = NULL').run();

    // Re-run only the UPDATE of the migration (the ALTER already ran when the test database was built).
    const update = migration0009
      .split(';')
      .map((s) => s.replace(/--[^\n]*/g, '').trim())
      .find((s) => s.startsWith('UPDATE users'));
    expect(update).toBeTruthy();
    await db.exec((update ?? '').replace(/\s+/g, ' ') + ';');

    const stamped = async (id: string) => (await db.prepare('SELECT first_agent_question_at AS at FROM users WHERE id = ?').bind(id).first<{ at: string | null }>())?.at;
    expect(await stamped(USER_ID)).toBe('2026-10-04T00:00:00.000Z');
    expect(await stamped(OTHER)).toBeNull();
    expect(await stamped(THIRD)).toBeNull();
  });
});
