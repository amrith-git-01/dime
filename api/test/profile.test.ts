import { env as workerEnv } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { validateAvatarUrl } from '../src/features/profile-avatar/fetch';
import { detectImageFormat } from '../src/core/image-format';
import { USER_ID, call, makeCtx, makeEnv } from './helpers';
import { oneRow, rowsOf, seedPushToken, seedSettings, seedUser, testDb } from './db';
import { settingsFromRow } from '../src/features/user-settings/snapshot';
import { useSupabaseStub } from './supabase-stub';

// Relational data lives in D1; the stub only serves Storage and other outbound HTTP.
const stub = useSupabaseStub();
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array<number>(64).fill(0)]);
const GOOD_URL = 'https://api.dicebear.com/7.x/adventurer-neutral/png?seed=abc&size=256';

describe('auth on every R1 router', () => {
  const cases: [string, string][] = [
    ['GET', '/api/v1/me'],
    ['PUT', '/api/v1/me/profile'],
    ['GET', '/api/v1/me/settings'],
    ['PATCH', '/api/v1/me/settings'],
    ['PUT', '/api/v1/me/push-token'],
    ['DELETE', '/api/v1/me/push-token'],
    ['POST', '/api/v1/profile/avatar'],
    ['POST', '/api/v1/profile/avatar/from-url'],
    ['GET', '/api/v1/categories'],
    ['POST', '/api/v1/categories'],
    ['PATCH', '/api/v1/categories/x'],
    ['DELETE', '/api/v1/categories/x'],
    ['GET', '/api/v1/categories/x/delete-impact'],
    ['GET', '/api/v1/budget'],
    ['PATCH', '/api/v1/budget'],
    ['GET', '/api/v1/budget/categories'],
    ['PUT', '/api/v1/budget/categories/x'],
    ['DELETE', '/api/v1/budget/categories/x'],
    ['GET', '/api/v1/notifications'],
    ['GET', '/api/v1/notifications/unread-count'],
    ['PATCH', '/api/v1/notifications/x/read'],
    ['DELETE', '/api/v1/notifications/x'],
    ['POST', '/api/v1/feedback'],
  ];
  it.each(cases)('%s %s returns 401 without a token', async (method, path) => {
    const res = await call(path, { method, token: false });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: 'Not authenticated.' });
  });
});

describe('GET /me', () => {
  it('returns the profile with the JWT email and no writes when the email is unchanged', async () => {
    await testDb().prepare("UPDATE users SET username = 'amrith', email = 'a@x.com', updated_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").bind(USER_ID).run();
    const { ctx, flush } = makeCtx();
    const res = await call('/api/v1/me', { email: 'a@x.com' }, ctx);
    await flush();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: USER_ID, email: 'a@x.com', username: 'amrith', avatar_url: null, currency: 'INR' });
    // No write: the row's updated_at is untouched.
    expect((await oneRow<{ updated_at: string }>('users', 'id = ?', USER_ID))?.updated_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('missing row: returns bare identity (nulls) and triggers the welcome flow without a write', async () => {
    await testDb().prepare('DELETE FROM users WHERE id = ?').bind(USER_ID).run();
    const { ctx, flush } = makeCtx();
    const res = await call('/api/v1/me', { email: 'a@x.com' }, ctx);
    await flush();
    expect(await res.json()).toEqual({ id: USER_ID, email: 'a@x.com', username: null, avatar_url: null, currency: null });
    expect(await rowsOf('users')).toHaveLength(0);
  });

  it('changed email is persisted in the background (after the response)', async () => {
    await testDb().prepare("UPDATE users SET username = 'u', email = 'old@x.com' WHERE id = ?").bind(USER_ID).run();
    const { ctx, flush } = makeCtx();
    await call('/api/v1/me', { email: 'new@x.com' }, ctx);
    await flush();
    expect((await oneRow<{ email: string }>('users', 'id = ?', USER_ID))?.email).toBe('new@x.com');
  });
});

describe('PUT /me/profile', () => {
  it('upserts trimmed values and returns the stored row in one request', async () => {
    const res = await call('/api/v1/me/profile', { method: 'PUT', json: { username: '  amrith ', currency: ' USD ' }, email: 'a@x.com' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ username: 'amrith', currency: 'USD', email: 'a@x.com' });
    expect(await oneRow('users', 'id = ?', USER_ID)).toMatchObject({ username: 'amrith', currency: 'USD', avatar_url: null });
  });

  it('keeps the stored avatar when none is sent, and creates the row for a new user', async () => {
    await testDb().prepare("UPDATE users SET avatar_url = 'https://img/x.png' WHERE id = ?").bind(USER_ID).run();
    await call('/api/v1/me/profile', { method: 'PUT', json: { username: 'amrith' } });
    expect((await oneRow<{ avatar_url: string }>('users', 'id = ?', USER_ID))?.avatar_url).toBe('https://img/x.png');
    await call('/api/v1/me/profile', { method: 'PUT', json: { username: 'amrith', avatar_url: ' https://img/y.png ' } });
    expect((await oneRow<{ avatar_url: string }>('users', 'id = ?', USER_ID))?.avatar_url).toBe('https://img/y.png');
    await testDb().prepare('DELETE FROM users').run();
    const created = await call('/api/v1/me/profile', { method: 'PUT', json: { username: 'newbie' } });
    expect(await created.json()).toMatchObject({ username: 'newbie', currency: 'INR' });
  });

  it('422s with a FastAPI shape for a short username', async () => {
    const res = await call('/api/v1/me/profile', { method: 'PUT', json: { username: 'ab' } });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      detail: [{ type: 'string_too_short', loc: ['body', 'username'], msg: 'String should have at least 3 characters' }],
    });
  });
});

describe('/me/settings', () => {
  const full = {
    budget_alerts_enabled: true, budget_monthly_alerts_enabled: true,
    budget_category_alerts_enabled: true, budget_monthly_warn_pct: 80,
    budget_category_warn_pct: 80, auto_capture_alerts_enabled: true, capture_failed_alerts_enabled: true,
    device_notifications_enabled: true, daily_expense_reminder_enabled: true, daily_expense_reminder_time: '20:00',
    weekly_email_enabled: true, monthly_email_enabled: true,
    // Broke Report: push + inbox alert when a month's report is ready, and the tone of its copy (read by the app).
    report_alerts_enabled: true, report_roast_level: 'spicy',
    // Removed daily-budget keys, still answered as 'off' for installed 1.0.0 builds.
    budget_daily_alerts_enabled: false, budget_daily_warn_pct: 80,
    // Per-screen card order ("Arrange"); {} until somebody rearranges a screen.
    card_layouts: {},
    // Money reminders, the user's own UPI id and the timezone the app writes.
    reminders_enabled: true, reminder_default_lead_days: [3, 1, 0], reminder_time: '09:00', reminder_overdue_nudges: 2,
    reminder_quiet_enabled: false, reminder_quiet_start: '22:00', reminder_quiet_end: '08:00', reminder_hide_amounts: false,
    upi_id: null, timezone: null,
  };

  it('GET creates defaults when the row is missing', async () => {
    const res = await call('/api/v1/me/settings');
    expect(await res.json()).toEqual(full);
    expect(await rowsOf('user_settings')).toHaveLength(1);
    // A second read returns the same stored row.
    expect(await (await call('/api/v1/me/settings')).json()).toEqual(full);
    expect(await rowsOf('user_settings')).toHaveLength(1);
  });

  it('PATCH updates only provided fields (null = unchanged) in one round trip', async () => {
    await seedSettings({ weekly_email_enabled: 0 });
    const res = await call('/api/v1/me/settings', {
      method: 'PATCH',
      json: { budget_alerts_enabled: false, budget_monthly_warn_pct: 70, weekly_email_enabled: null },
    });
    expect(await res.json()).toEqual({ ...full, budget_monthly_warn_pct: 70, budget_alerts_enabled: false, weekly_email_enabled: false });
    // null = unchanged: the stored weekly flag stays off.
    expect(await oneRow('user_settings', 'user_id = ?', USER_ID)).toMatchObject({ weekly_email_enabled: 0, budget_alerts_enabled: 0, budget_monthly_warn_pct: 70 });
  });

  it('PATCH creates the row (with the patch applied) when none exists', async () => {
    const res = await call('/api/v1/me/settings', { method: 'PATCH', json: { daily_expense_reminder_time: '21:30' } });
    expect(await res.json()).toMatchObject({ daily_expense_reminder_time: '21:30', budget_alerts_enabled: true });
    expect(await rowsOf('user_settings')).toHaveLength(1);
  });

  it('rejects bad time, out-of-range pct and unknown fields with FastAPI-style 422s', async () => {
    const bad = await call('/api/v1/me/settings', { method: 'PATCH', json: { daily_expense_reminder_time: '25:00', budget_monthly_warn_pct: 99, nope: 1 } });
    expect(bad.status).toBe(422);
    const { detail } = await bad.json<{ detail: { type: string; loc: string[] }[] }>();
    expect(detail.map((d) => d.type).sort()).toEqual(['extra_forbidden', 'less_than_equal', 'string_pattern_mismatch']);
  });

  it('still accepts the removed daily budget keys (old app builds) and ignores them', async () => {
    const res = await call('/api/v1/me/settings', {
      method: 'PATCH',
      json: { budget_daily_alerts_enabled: false, budget_daily_warn_pct: 60, budget_alerts_enabled: false },
    });
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, unknown>>();
    expect(body).toMatchObject({ budget_alerts_enabled: false });
    // The sent values are ignored: the response keeps the fixed legacy values.
    expect(body).toMatchObject({ budget_daily_alerts_enabled: false, budget_daily_warn_pct: 80 });
    expect(await oneRow('user_settings', 'user_id = ?', USER_ID)).toMatchObject({ budget_daily_alerts_enabled: 1, budget_daily_warn_pct: 80 });
  });

  describe('card_layouts', () => {
    // Many writes in a row: skip the (shared, per-isolate) write limiter so later suites keep their budget.
    const patch = (card_layouts: unknown) =>
      call('/api/v1/me/settings', { method: 'PATCH', json: { card_layouts }, env: makeEnv({ WRITE_LIMITER: undefined }) });
    const stored = async () => (await oneRow<{ card_layouts: string | null }>('user_settings', 'user_id = ?', USER_ID))?.card_layouts;

    it('creates the row with the layout when none exists and echoes it as an object', async () => {
      const res = await patch({ home: ['home.stats', 'home.month'] });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ...full, card_layouts: { home: ['home.stats', 'home.month'] } });
      expect(JSON.parse((await stored()) ?? 'null')).toEqual({ home: ['home.stats', 'home.month'] });
    });

    it('merges per screen: patching one screen leaves the others untouched, and replaces that screen\'s list', async () => {
      await patch({ home: ['home.stats', 'home.month'], budgets: ['budgets.recurring', 'budgets.summary'] });
      const res = await patch({ home: ['home.recent'], insights: ['insights.compare'] });
      expect((await res.json<{ card_layouts: unknown }>()).card_layouts).toEqual({
        home: ['home.recent'],
        budgets: ['budgets.recurring', 'budgets.summary'],
        insights: ['insights.compare'],
      });
    });

    it('an empty list removes that screen only; no screens left stores NULL', async () => {
      await patch({ home: ['home.stats'], budgets: ['budgets.recurring'] });
      expect((await (await patch({ home: [] })).json<{ card_layouts: unknown }>()).card_layouts).toEqual({ budgets: ['budgets.recurring'] });
      expect((await (await patch({ budgets: [] })).json<{ card_layouts: unknown }>()).card_layouts).toEqual({});
      expect(await stored()).toBeNull();
    });

    it('does not disturb other settings, and other settings patches do not touch the layout', async () => {
      await patch({ home: ['home.stats'] });
      const env = makeEnv({ WRITE_LIMITER: undefined });
      const res = await call('/api/v1/me/settings', { method: 'PATCH', json: { budget_alerts_enabled: false, card_layouts: { insights: ['insights.month'] } }, env });
      expect(await res.json()).toEqual({ ...full, budget_alerts_enabled: false, card_layouts: { home: ['home.stats'], insights: ['insights.month'] } });
      const again = await call('/api/v1/me/settings', { method: 'PATCH', json: { weekly_email_enabled: false }, env });
      expect((await again.json<{ card_layouts: unknown }>()).card_layouts).toEqual({ home: ['home.stats'], insights: ['insights.month'] });
    });

    it('null and an empty object leave the layout unchanged', async () => {
      await patch({ home: ['home.stats'] });
      for (const value of [null, {}]) {
        expect((await (await patch(value)).json<{ card_layouts: unknown }>()).card_layouts).toEqual({ home: ['home.stats'] });
      }
    });

    it('rejects unknown screens, bad ids, duplicates, too many ids and oversized payloads with 422', async () => {
      const long = 'a'.repeat(49);
      const many = Array.from({ length: 31 }, (_, i) => `card.${i}`);
      const huge = Array.from({ length: 30 }, (_, i) => `${'x'.repeat(46)}${String(i).padStart(2, '0')}`);
      for (const bad of [
        { settings: ['a'] },
        { home: ['Home.Month'] },
        { home: ['1abc'] },
        { home: [long] },
        { home: ['home.a b'] },
        { home: ['home.a', 'home.a'] },
        { home: many },
        { home: 'home.a' },
        { home: huge, budgets: huge, insights: huge },
      ]) {
        const res = await patch(bad);
        expect(res.status, JSON.stringify(bad).slice(0, 60)).toBe(422);
      }
      expect(await rowsOf('user_settings')).toHaveLength(0);
    });

    it('reads corrupt or foreign stored JSON as no layout instead of failing', async () => {
      for (const raw of ['{not json', '[1,2]', '"x"', '{"home":"nope","budgets":[1],"other":["a"],"insights":["insights.month"]}']) {
        await testDb().prepare('DELETE FROM user_settings').run();
        await seedSettings({ card_layouts: raw });
        const res = await call('/api/v1/me/settings');
        expect((await res.json<{ card_layouts: unknown }>()).card_layouts).toEqual(raw.includes('insights.month') ? { insights: ['insights.month'] } : {});
      }
    });

    it('a patch over corrupt stored JSON starts from an empty object', async () => {
      await seedSettings({ card_layouts: '{broken' });
      expect((await (await patch({ home: ['home.stats'] })).json<{ card_layouts: unknown }>()).card_layouts).toEqual({ home: ['home.stats'] });
    });
  });

  it('PATCH stores the Broke Report alert switch and roast level', async () => {
    const res = await call('/api/v1/me/settings', { method: 'PATCH', json: { report_alerts_enabled: false, report_roast_level: 'savage' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...full, report_alerts_enabled: false, report_roast_level: 'savage' });
    expect(await oneRow('user_settings', 'user_id = ?', USER_ID)).toMatchObject({ report_alerts_enabled: 0, report_roast_level: 'savage' });
    // null = unchanged; the other level names are accepted too.
    const again = await call('/api/v1/me/settings', { method: 'PATCH', json: { report_roast_level: null, report_alerts_enabled: true } });
    expect(await again.json()).toEqual({ ...full, report_roast_level: 'savage' });
    expect((await call('/api/v1/me/settings', { method: 'PATCH', json: { report_roast_level: 'gentle' } })).status).toBe(200);
  });

  it('PATCH rejects an unknown roast level', async () => {
    const res = await call('/api/v1/me/settings', { method: 'PATCH', json: { report_roast_level: 'brutal' } });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ detail: [{ loc: ['body', 'report_roast_level'] }] });
    expect(await rowsOf('user_settings')).toHaveLength(0);
  });

  it('a stored roast level the code does not know reads as the default', async () => {
    expect(settingsFromRow({ report_roast_level: 'brutal' }).report_roast_level).toBe('spicy');
    expect(settingsFromRow({ report_roast_level: 'gentle' }).report_roast_level).toBe('gentle');
    expect(settingsFromRow({}).report_alerts_enabled).toBe(true);
    expect(settingsFromRow({ report_alerts_enabled: 0 }).report_alerts_enabled).toBe(false);
    // The table refuses such a value in the first place.
    await expect(seedSettings({ report_roast_level: 'brutal' })).rejects.toThrow();
  });

  describe('reminder settings', () => {
    // The write limiter is per file (60 a minute): these many PATCHes would starve the avatar tests further down.
    const patch = (json: unknown) => call('/api/v1/me/settings', { method: 'PATCH', json, env: makeEnv({ WRITE_LIMITER: undefined }) });

    it('PATCH stores every reminder field (the lead days as JSON) and answers them back', async () => {
      const changed = {
        reminders_enabled: false, reminder_default_lead_days: [7, 2, 0], reminder_time: '18:30', reminder_overdue_nudges: 5,
        reminder_quiet_enabled: true, reminder_quiet_start: '23:00', reminder_quiet_end: '07:30', reminder_hide_amounts: true,
        upi_id: 'me@okhdfc', timezone: 'Asia/Kolkata',
      };
      const res = await patch(changed);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ...full, ...changed });
      expect(await oneRow('user_settings', 'user_id = ?', USER_ID)).toMatchObject({
        reminders_enabled: 0, reminder_default_lead_days: '[7,2,0]', reminder_time: '18:30', reminder_overdue_nudges: 5,
        reminder_quiet_enabled: 1, reminder_hide_amounts: 1, upi_id: 'me@okhdfc', timezone: 'Asia/Kolkata',
      });
      expect(await (await call('/api/v1/me/settings')).json()).toEqual({ ...full, ...changed });
    });

    it('an empty lead-days list is allowed (no lead reminders); null leaves everything unchanged', async () => {
      expect(await (await patch({ reminder_default_lead_days: [] })).json()).toMatchObject({ reminder_default_lead_days: [] });
      const same = await patch({ reminder_default_lead_days: null, reminder_time: null, upi_id: null, timezone: null, reminder_overdue_nudges: null });
      expect(await same.json()).toMatchObject({ reminder_default_lead_days: [], reminder_time: '09:00', upi_id: null, timezone: null });
    });

    it("upi_id '' clears the stored id (NULL); null leaves it", async () => {
      await patch({ upi_id: 'me@okhdfc' });
      expect(await (await patch({ upi_id: null })).json()).toMatchObject({ upi_id: 'me@okhdfc' });
      expect(await (await patch({ upi_id: '' })).json()).toMatchObject({ upi_id: null });
      expect((await oneRow<Record<string, unknown>>('user_settings', 'user_id = ?', USER_ID))?.['upi_id']).toBeNull();
      expect(await (await patch({ upi_id: '  me@okhdfc  ' })).json()).toMatchObject({ upi_id: 'me@okhdfc' });
    });

    it('creating the row with a reminder field applies it', async () => {
      expect(await (await patch({ reminder_default_lead_days: [1], upi_id: 'me@okhdfc' })).json()).toMatchObject({ reminder_default_lead_days: [1], upi_id: 'me@okhdfc' });
      expect(await rowsOf('user_settings')).toHaveLength(1);
    });

    it('rejects values outside the limits (422, nothing stored)', async () => {
      const bad: Record<string, unknown>[] = [
        { reminder_default_lead_days: [31] },
        { reminder_default_lead_days: [-1] },
        { reminder_default_lead_days: [1, 1] },
        { reminder_default_lead_days: [0, 1, 2, 3, 4, 5] },
        { reminder_default_lead_days: ['1'] },
        { reminder_default_lead_days: 3 },
        { reminder_time: '24:00' },
        { reminder_time: '9:00' },
        { reminder_overdue_nudges: 6 },
        { reminder_overdue_nudges: -1 },
        { reminder_overdue_nudges: 1.5 },
        { reminder_quiet_start: '25:00' },
        { reminder_quiet_end: 'late' },
        { upi_id: 'nope' },
        { upi_id: 'a@b' },
        { upi_id: 'ra vi@okhdfc' },
        { timezone: 'Mars/Olympus' },
        { timezone: 'x' },
        { reminders_enabled: 'yes' },
      ];
      for (const body of bad) expect((await patch(body)).status, JSON.stringify(body)).toBe(422);
      expect(await rowsOf('user_settings')).toHaveLength(0);
    });

    it('a stored value the code cannot read falls back to the default; the table refuses such values', async () => {
      expect(settingsFromRow({ reminder_default_lead_days: '{broken' }).reminder_default_lead_days).toEqual([3, 1, 0]);
      expect(settingsFromRow({ reminder_default_lead_days: '[99]' }).reminder_default_lead_days).toEqual([3, 1, 0]);
      expect(settingsFromRow({ reminder_default_lead_days: '[5]' }).reminder_default_lead_days).toEqual([5]);
      expect(settingsFromRow({ reminder_time: 'soon' }).reminder_time).toBe('09:00');
      expect(settingsFromRow({ reminder_overdue_nudges: 99 }).reminder_overdue_nudges).toBe(5);
      expect(settingsFromRow({ upi_id: '' }).upi_id).toBeNull();
      expect(settingsFromRow({}).timezone).toBeNull();
      await expect(seedSettings({ reminder_default_lead_days: '{broken' })).rejects.toThrow();
      await expect(seedSettings({ reminder_overdue_nudges: 6 })).rejects.toThrow();
      await expect(seedSettings({ reminder_time: '24:00' })).rejects.toThrow();
    });
  });

  it('clamps stored warn percentages like the Python snapshot', async () => {
    // The table's CHECK (50..95) keeps such values out of D1; the clamp still guards legacy / imported rows.
    const body = settingsFromRow({ ...full, budget_monthly_warn_pct: 10, budget_category_warn_pct: 200 });
    expect([body.budget_monthly_warn_pct, body.budget_category_warn_pct]).toEqual([50, 95]);
    await expect(seedSettings({ budget_monthly_warn_pct: 10 })).rejects.toThrow();
  });
});

describe('POST /feedback', () => {
  it('inserts trimmed message with reporter fields and returns 201 {id}', async () => {
    await testDb().prepare("UPDATE users SET username = ' amrith ' WHERE id = ?").bind(USER_ID).run();
    const res = await call('/api/v1/feedback', { method: 'POST', json: { type: 'bug', message: '  hello world  ' }, email: 'a@x.com' });
    expect(res.status).toBe(201);
    const { id } = await res.json<{ id: string }>();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await rowsOf('user_feedback')).toEqual([
      expect.objectContaining({
        id, user_id: USER_ID, message: 'hello world', feedback_type: 'bug', reporter_email: 'a@x.com', reporter_username: 'amrith',
      }),
    ]);
  });

  it('rejects a message that is shorter than 8 characters after trimming with a string 422', async () => {
    const res = await call('/api/v1/feedback', { method: 'POST', json: { type: 'idea', message: '   short ' } });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail: 'message must be at least 8 characters' });
  });

  it('rejects an unknown type', async () => {
    const res = await call('/api/v1/feedback', { method: 'POST', json: { type: 'rant', message: 'long enough text' } });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      detail: [{ type: 'literal_error', loc: ['body', 'type'], msg: "Input should be 'bug', 'idea' or 'enhancement'" }],
    });
  });
});

describe('/me/push-token', () => {
  it('PUT upserts on the token and returns it', async () => {
    const res = await call('/api/v1/me/push-token', { method: 'PUT', json: { token: 'ExponentPushToken[abc]' } });
    expect(await res.json()).toEqual({ token: 'ExponentPushToken[abc]' });
    expect(await rowsOf('user_push_tokens')).toEqual([
      expect.objectContaining({ user_id: USER_ID, expo_push_token: 'ExponentPushToken[abc]', platform: 'android' }),
    ]);
  });

  it('PUT moves a token that is registered on another account (conflict on the token) and is idempotent', async () => {
    await seedUser('33333333-3333-3333-3333-333333333333');
    await seedPushToken('ExponentPushToken[abc]', '33333333-3333-3333-3333-333333333333');
    await call('/api/v1/me/push-token', { method: 'PUT', json: { token: 'ExponentPushToken[abc]' } });
    await call('/api/v1/me/push-token', { method: 'PUT', json: { token: 'ExponentPushToken[abc]' } });
    expect(await rowsOf('user_push_tokens')).toEqual([expect.objectContaining({ user_id: USER_ID, expo_push_token: 'ExponentPushToken[abc]' })]);
  });

  it('PUT validates token length and platform', async () => {
    expect((await call('/api/v1/me/push-token', { method: 'PUT', json: { token: 'short' } })).status).toBe(422);
    expect((await call('/api/v1/me/push-token', { method: 'PUT', json: { token: 'longenough1', platform: 'ios' } })).status).toBe(422);
  });

  it('DELETE with a token removes only that token; without one removes all of the user', async () => {
    const other = '33333333-3333-3333-3333-333333333333';
    await seedUser(other);
    await seedPushToken('tok-12345');
    await seedPushToken('tok-67890');
    await seedPushToken('tok-other-1', other);
    const one = await call('/api/v1/me/push-token', { method: 'DELETE', json: { token: 'tok-12345' } });
    expect(one.status).toBe(204);
    expect((await rowsOf<{ expo_push_token: string }>('user_push_tokens')).map((r) => r.expo_push_token)).toEqual(['tok-67890', 'tok-other-1']);
    await call('/api/v1/me/push-token', { method: 'DELETE', json: {} });
    expect((await rowsOf<{ expo_push_token: string }>('user_push_tokens')).map((r) => r.expo_push_token)).toEqual(['tok-other-1']);
  });
});

describe('image format sniffing', () => {
  it('detects jpeg/png/webp and rejects others or short input', () => {
    expect(detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff, ...new Array<number>(12).fill(0)]))?.ext).toBe('jpg');
    expect(detectImageFormat(PNG)?.ext).toBe('png');
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
    expect(detectImageFormat(webp)?.contentType).toBe('image/webp');
    expect(detectImageFormat(new TextEncoder().encode('GIF89a......'))).toBeNull();
    expect(detectImageFormat(PNG.subarray(0, 8))).toBeNull();
  });
});

describe('POST /profile/avatar', () => {
  const upload = (bytes: Uint8Array, name = 'avatar.png', type = 'image/png') => {
    const form = new FormData();
    form.append('file', new File([bytes], name, { type }));
    return call('/api/v1/profile/avatar', { method: 'POST', body: form });
  };

  it('stores a PNG at avatars/<user>/avatar.png and returns a versioned public URL', async () => {
    const res = await upload(PNG);
    expect(res.status).toBe(200);
    const { avatar_url } = await res.json<{ avatar_url: string }>();
    expect(avatar_url).toMatch(new RegExp(`^https://[^/]+/media/avatars/${USER_ID}/avatar\\.png\\?v=\\d+$`));
    const stored = await workerEnv.MEDIA.get(`avatars/${USER_ID}/avatar.png`);
    expect(stored?.httpMetadata?.contentType).toBe('image/png');
    expect(stored?.size).toBe(PNG.byteLength);
    expect((await oneRow<{ avatar_url: string }>('users', 'id = ?', USER_ID))?.avatar_url).toBe(avatar_url);
  });

  it('rejects non-images by magic bytes (400) and empty files', async () => {
    const res = await upload(new TextEncoder().encode('<html>not an image at all</html>'), 'a.png');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: 'Unsupported image type (use JPEG, PNG, or WebP).' });
    const empty = await upload(new Uint8Array(0));
    expect(await empty.json()).toEqual({ detail: 'Empty file.' });
    expect((await workerEnv.MEDIA.list()).objects).toEqual([]);
  });

  it('422s when the file part is missing', async () => {
    const form = new FormData();
    form.append('other', 'x');
    const res = await call('/api/v1/profile/avatar', { method: 'POST', body: form });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail: [{ type: 'missing', loc: ['body', 'file'], msg: 'Field required' }] });
  });

  it('413s a file over 5 MB and a too-large body', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await upload(big)).status).toBe(413);
  });

  it('maps storage failure to 502 and leaves the profile untouched', async () => {
    const broken = { put: () => Promise.reject(new Error('boom')) };
    const form = new FormData();
    form.append('file', new File([PNG], 'avatar.png', { type: 'image/png' }));
    const res = await call('/api/v1/profile/avatar', { method: 'POST', body: form, env: makeEnv({ MEDIA: broken as unknown as string }) });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: 'Could not store image.' });
    expect((await oneRow<{ avatar_url: string | null }>('users', 'id = ?', USER_ID))?.avatar_url).toBeNull();
  });
});

describe('POST /profile/avatar/from-url (S1)', () => {
  const post = (image_url: string) => call('/api/v1/profile/avatar/from-url', { method: 'POST', json: { image_url } });

  it('fetches an allowlisted https image, uploads it and never follows redirects', async () => {
    stub.on('GET', '/7.x/', () => new Response(PNG, { headers: { 'content-type': 'image/png' } }));
    const res = await post(GOOD_URL);
    expect(res.status).toBe(200);
    const fetched = stub.calls.find((c) => c.url.host === 'api.dicebear.com');
    expect(fetched?.url.href).toBe(GOOD_URL);
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost/avatar.png',
    'https://127.0.0.1/avatar.png',
    'https://10.0.0.5/avatar.png',
    'https://[::1]/avatar.png',
    'https://evil.example.com/avatar.png',
    'https://api.dicebear.com.evil.example.com/x.png',
    'https://api.dicebear.com@evil.example.com/x.png',
    'https://user:pw@api.dicebear.com/x.png',
    'https://api.dicebear.com:8443/x.png',
    'http://api.dicebear.com/x.png',
    'ftp://api.dicebear.com/x.png',
    'file:///etc/passwd',
    'not a url',
  ])('rejects %s with 400 and makes no network request', async (url) => {
    const res = await post(url);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: 'Image URL is not allowed.' });
    expect(stub.calls).toHaveLength(0);
  });

  it('treats a redirect as a failure (does not follow it)', async () => {
    stub.on('GET', '/7.x/', () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/secret' } }));
    const res = await post(GOOD_URL);
    expect(res.status).toBe(400);
    expect(stub.calls.filter((c) => c.method === 'GET')).toHaveLength(1);
  });

  it('rejects non-image content types, oversized streams and non-200 upstreams', async () => {
    stub.on('GET', '/7.x/', () => new Response('<html>', { headers: { 'content-type': 'text/html' } }), { once: true });
    expect(await (await post(GOOD_URL)).json()).toEqual({ detail: 'Selected URL is not an image.' });

    stub.on('GET', '/7.x/', () => new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/png' } }), { once: true });
    expect(await (await post(GOOD_URL)).json()).toEqual({ detail: 'Image too large.' });

    stub.on('GET', '/7.x/', () => new Response(null, { status: 404 }), { once: true });
    expect(await (await post(GOOD_URL)).json()).toEqual({ detail: 'Could not fetch selected avatar image.' });
  });

  it('rejects an image-typed body that is not actually an image (magic bytes)', async () => {
    stub.on('GET', '/7.x/', () => new Response('plain text, not an image', { headers: { 'content-type': 'image/png' } }));
    const res = await post(GOOD_URL);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: 'Unsupported image type (use JPEG, PNG, or WebP).' });
  });
});

describe('validateAvatarUrl', () => {
  it('normalizes and accepts the default port, honours a custom allowlist case-insensitively', () => {
    expect(validateAvatarUrl(' https://API.dicebear.com:443/x.png ', ['api.dicebear.com'])).toBe('https://api.dicebear.com/x.png');
    expect(() => validateAvatarUrl('https://cdn.example.com/x.png', ['api.dicebear.com'])).toThrow();
    expect(validateAvatarUrl('https://CDN.example.com/x.png', ['cdn.example.com'])).toContain('cdn.example.com');
  });
});
