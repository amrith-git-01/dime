import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { listReminders } from '../src/features/reminders/service';
import { USER_ID, call, makeEnv } from './helpers';
import { oneRow, rowsOf, seedReminder, seedSettings, seedTransaction, seedUser, spyDb, testDb, uid } from './db';

const IST = 'Asia/Kolkata';
const OTHER = '33333333-3333-3333-3333-333333333333';
/** 09:30 IST on Sat 31 Oct 2026. */
const NOW = Date.parse('2026-10-31T04:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

interface Match {
  transaction_id: string;
  amount: string;
  display_name: string;
  date: string;
}
interface Reminder {
  id: string;
  direction: string;
  title: string;
  amount: string | null;
  counterparty_name: string | null;
  upi_id: string | null;
  due_date: string;
  cadence: string;
  lead_days: number[] | null;
  effective_lead_days: number[];
  remind_time: string | null;
  timezone: string;
  status: string;
  completed_at: string | null;
  next_fire_at: string | null;
  suggested_match: Match | null;
}

const rent = (over: Record<string, unknown> = {}) => ({
  direction: 'pay',
  title: 'Rent',
  amount: '15000',
  counterparty_name: 'Landlord',
  due_date: '2026-11-10',
  timezone: IST,
  ...over,
});

async function api(path: string, opts: { method?: string; json?: unknown; token?: string | false } = {}) {
  return call(`/api/v1/reminders${path}`, { ...opts, env: makeEnv({ WRITE_LIMITER: undefined }) });
}
async function create(body: Record<string, unknown> = rent(), token?: string) {
  const res = await api('', { method: 'POST', json: body, ...(token ? { token } : {}) });
  // The body is read once here: `item` for a created reminder, `json` for anything (an error's detail).
  const json = await res.json<Reminder & { detail: { loc: (string | number)[] }[] }>();
  return { res, item: json, json };
}
const list = async (query = '') => (await (await api(query)).json<{ items: Reminder[] }>()).items;
const dbRow = (id: string) => oneRow<Record<string, unknown>>('reminders', 'id = ?', id);

describe('auth', () => {
  it('every route needs a token', async () => {
    const id = uid();
    for (const [method, path] of [
      ['GET', ''],
      ['POST', ''],
      ['PATCH', `/${id}`],
      ['DELETE', `/${id}`],
      ['POST', `/${id}/complete`],
      ['POST', `/${id}/skip`],
    ] as const) {
      const res = await api(path, { method, ...(method === 'GET' ? {} : { json: {} }), token: false });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });
});

describe('POST /reminders', () => {
  it('creates a reminder and answers the full shape (201)', async () => {
    const { res, item } = await create();
    expect(res.status).toBe(201);
    expect(item).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
      direction: 'pay',
      title: 'Rent',
      amount: '15000.00',
      counterparty_name: 'Landlord',
      upi_id: null,
      due_date: '2026-11-10',
      cadence: 'none',
      lead_days: null,
      effective_lead_days: [3, 1, 0],
      remind_time: null,
      timezone: IST,
      status: 'open',
      completed_at: null,
      next_fire_at: '2026-11-07T03:30:00.000Z', // 3 days before, 09:00 IST
      suggested_match: null,
    });
    expect(await dbRow(item.id)).toMatchObject({ amount: 1500000, payee_key: 'landlord', anchor_day: 10, fired_through: null, lead_days: null });
  });

  it('keeps optional fields: own lead days and time, UPI id, repeat; trims text; blank name and UPI become null', async () => {
    const { item } = await create(rent({ title: '  Rent  ', counterparty_name: '   ', amount: undefined, upi_id: ' landlord@okhdfc ', cadence: 'monthly', lead_days: [2], remind_time: '18:30' }));
    expect(item).toMatchObject({
      title: 'Rent',
      amount: null,
      counterparty_name: null,
      upi_id: 'landlord@okhdfc',
      cadence: 'monthly',
      lead_days: [2],
      effective_lead_days: [2],
      remind_time: '18:30',
      next_fire_at: '2026-11-08T13:00:00.000Z', // 2 days before, 18:30 IST
    });
    expect(await dbRow(item.id)).toMatchObject({ payee_key: null, lead_days: '[2]' });
    expect((await create(rent({ upi_id: '' }))).item.upi_id).toBeNull();
  });

  it('uses the user settings for lead days, time, nudges and quiet hours', async () => {
    await seedSettings({ reminder_default_lead_days: '[5]', reminder_time: '23:00', reminder_quiet_enabled: 1 });
    const { item } = await create();
    expect(item.effective_lead_days).toEqual([5]);
    // 5 Nov 23:00 IST is inside the default quiet window 22:00-08:00: it moves to 6 Nov 08:00 IST.
    expect(item.next_fire_at).toBe('2026-11-06T02:30:00.000Z');
  });

  it('a reminder due today keeps its next overdue nudge; one with nothing left has no next instant', async () => {
    // 09:00 IST today already passed: the next step is tomorrow's nudge.
    expect((await create(rent({ due_date: '2026-10-31' }))).item.next_fire_at).toBe('2026-11-01T03:30:00.000Z');
    await seedSettings({ reminder_overdue_nudges: 0 });
    const spent = (await create(rent({ due_date: '2026-10-30' }))).item;
    expect(spent).toMatchObject({ status: 'open', next_fire_at: null });
  });

  it('accepts yesterday, rejects older dates', async () => {
    expect((await create(rent({ due_date: '2026-10-30' }))).res.status).toBe(201);
    const { res, json } = await create(rent({ due_date: '2026-10-29' }));
    expect(res.status).toBe(422);
    expect(json).toMatchObject({ detail: [{ loc: ['body', 'due_date'] }] });
  });

  it('validates every field (422, nothing stored)', async () => {
    const bad: [string, Record<string, unknown>][] = [
      ['direction', rent({ direction: 'owe' })],
      ['title', rent({ title: '   ' })],
      ['title', rent({ title: 'x'.repeat(81) })],
      ['amount', rent({ amount: '0' })],
      ['amount', rent({ amount: '-5' })],
      ['amount', rent({ amount: 'abc' })],
      ['due_date', rent({ due_date: '2026-02-30' })],
      ['due_date', rent({ due_date: '10/11/2026' })],
      ['cadence', rent({ cadence: 'daily' })],
      ['lead_days', rent({ lead_days: [1, 1] })],
      ['lead_days', rent({ lead_days: [0, 1, 2, 3, 4, 5] })],
      ['lead_days', rent({ lead_days: [31] })],
      ['lead_days', rent({ lead_days: [-1] })],
      ['lead_days', rent({ lead_days: ['1'] })],
      ['remind_time', rent({ remind_time: '24:00' })],
      ['remind_time', rent({ remind_time: '9:00' })],
      ['upi_id', rent({ upi_id: 'no-at-sign' })],
      ['upi_id', rent({ upi_id: 'a@b' })],
      ['timezone', rent({ timezone: 'Mars/Olympus' })],
      ['timezone', rent({ timezone: undefined })],
      ['counterparty_name', rent({ counterparty_name: 'x'.repeat(201) })],
    ];
    for (const [field, body] of bad) {
      const { res, json } = await create(body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(json.detail[0]?.loc.slice(0, 2), field).toEqual(['body', field]); // nested issues (lead_days[0]) start with the same two
    }
    expect(await rowsOf('reminders')).toHaveLength(0);
  });

  it('caps the number of reminders per user', async () => {
    const db = testDb();
    await db.prepare("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 500) INSERT INTO reminders (id, user_id, direction, title, due_date, anchor_day, timezone) SELECT printf('r%d', i), ?, 'pay', 'x', '2026-12-01', 1, 'Asia/Kolkata' FROM n").bind(USER_ID).run();
    const { res } = await create();
    expect(res.status).toBe(409);
  });
});

describe('GET /reminders', () => {
  it('lists open reminders by due date; done and all on request; limit', async () => {
    await seedReminder({ id: uid(), title: 'Later', due_date: '2026-12-01' });
    await seedReminder({ title: 'Sooner', due_date: '2026-11-05' });
    await seedReminder({ title: 'Paid', status: 'done', due_date: '2026-10-01' });
    await seedReminder({ title: 'Dropped', status: 'dismissed', due_date: '2026-10-02' });
    expect((await list()).map((r) => r.title)).toEqual(['Sooner', 'Later']);
    expect((await list('?status=open')).map((r) => r.title)).toEqual(['Sooner', 'Later']);
    expect((await list('?status=done')).map((r) => r.title).sort()).toEqual(['Dropped', 'Paid']);
    expect((await list('?status=all')).map((r) => r.title).slice(0, 2)).toEqual(['Sooner', 'Later']); // open first
    expect(await list('?status=all')).toHaveLength(4);
    expect(await list('?limit=1')).toHaveLength(1);
  });

  it('validates the query', async () => {
    expect((await api('?status=weird')).status).toBe(422);
    expect((await api('?limit=0')).status).toBe(422);
    expect((await api('?limit=201')).status).toBe(422);
  });

  it('only the caller’s reminders', async () => {
    await seedUser(OTHER);
    await seedReminder({ title: 'Mine' });
    await seedReminder({ title: 'Theirs', user_id: OTHER });
    expect((await list()).map((r) => r.title)).toEqual(['Mine']);
  });

  it('effective_lead_days shows the stored list or the user default', async () => {
    await seedSettings({ reminder_default_lead_days: '[7,2]' });
    await seedReminder({ title: 'Own', lead_days: [1], due_date: '2026-11-01' });
    await seedReminder({ title: 'Default', due_date: '2026-11-02' });
    const items = await list();
    expect(items.map((r) => [r.title, r.lead_days, r.effective_lead_days])).toEqual([
      ['Own', [1], [1]],
      ['Default', null, [7, 2]],
    ]);
  });
});

describe('PATCH /reminders/:id', () => {
  it('edits fields, clears the nullable ones with null, and restores the user defaults', async () => {
    const { item } = await create(rent({ lead_days: [1], remind_time: '20:00', upi_id: 'landlord@okhdfc' }));
    const res = await api(`/${item.id}`, { method: 'PATCH', json: { title: 'House rent', amount: '16000.50', counterparty_name: 'Owner', upi_id: null, lead_days: null, remind_time: null } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: 'House rent', amount: '16000.50', counterparty_name: 'Owner', upi_id: null, lead_days: null, remind_time: null, next_fire_at: '2026-11-07T03:30:00.000Z' });
    expect(await dbRow(item.id)).toMatchObject({ amount: 1600050, payee_key: 'owner', lead_days: null });
    const cleared = await (await api(`/${item.id}`, { method: 'PATCH', json: { amount: null, counterparty_name: null } })).json<Reminder>();
    expect(cleared).toMatchObject({ amount: null, counterparty_name: null });
    expect(await dbRow(item.id)).toMatchObject({ amount: null, payee_key: null });
  });

  it('a new due date re-plans the schedule, resets what was sent and moves the anchor day', async () => {
    const id = await seedReminder({ cadence: 'monthly', due_date: '2026-11-10', fired_through: '2026-11-07T03:30:00.000Z', next_fire_at: '2026-11-09T03:30:00.000Z' });
    const res = await api(`/${id}`, { method: 'PATCH', json: { due_date: '2026-11-30' } });
    expect(await res.json()).toMatchObject({ due_date: '2026-11-30', next_fire_at: '2026-11-27T03:30:00.000Z' });
    expect(await dbRow(id)).toMatchObject({ anchor_day: 30, fired_through: null });
    expect((await api(`/${id}`, { method: 'PATCH', json: { due_date: '2026-10-01' } })).status).toBe(422);
  });

  it('done stamps the time and stops the schedule; open again re-plans', async () => {
    const { item } = await create();
    const done = await (await api(`/${item.id}`, { method: 'PATCH', json: { status: 'done' } })).json<Reminder>();
    expect(done).toMatchObject({ status: 'done', next_fire_at: null, completed_at: new Date(NOW).toISOString() });
    const reopened = await (await api(`/${item.id}`, { method: 'PATCH', json: { status: 'open' } })).json<Reminder>();
    expect(reopened).toMatchObject({ status: 'open', completed_at: null, next_fire_at: '2026-11-07T03:30:00.000Z' });
  });

  it('validates and answers 404 for unknown or foreign ids', async () => {
    const { item } = await create();
    expect((await api(`/${item.id}`, { method: 'PATCH', json: { cadence: 'hourly' } })).status).toBe(422);
    expect((await api(`/${item.id}`, { method: 'PATCH', json: { status: 'gone' } })).status).toBe(422);
    expect((await api('/not-a-uuid', { method: 'PATCH', json: {} })).status).toBe(422);
    expect((await api(`/${uid()}`, { method: 'PATCH', json: { title: 'x' } })).status).toBe(404);
    await seedUser(OTHER);
    const theirs = await seedReminder({ user_id: OTHER });
    expect((await api(`/${theirs}`, { method: 'PATCH', json: { title: 'mine now' } })).status).toBe(404);
    expect(await dbRow(theirs)).toMatchObject({ title: 'Rent' });
  });
});

describe('DELETE /reminders/:id', () => {
  it('deletes (204) once, then 404; never someone else’s', async () => {
    const { item } = await create();
    expect((await api(`/${item.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await rowsOf('reminders')).toHaveLength(0);
    expect((await api(`/${item.id}`, { method: 'DELETE' })).status).toBe(404);
    await seedUser(OTHER);
    const theirs = await seedReminder({ user_id: OTHER });
    expect((await api(`/${theirs}`, { method: 'DELETE' })).status).toBe(404);
    expect(await rowsOf('reminders')).toHaveLength(1);
  });
});

describe('POST /reminders/:id/complete', () => {
  it('a one-off becomes done, stamped, schedule stopped', async () => {
    const { item } = await create();
    const res = await api(`/${item.id}/complete`, { method: 'POST', json: {} });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'done', completed_at: new Date(NOW).toISOString(), next_fire_at: null, suggested_match: null });
    expect(await dbRow(item.id)).toMatchObject({ status: 'done', completed_txn_id: null });
  });

  it('links the transaction when given; it must be the caller’s live one', async () => {
    const tx = await seedTransaction({ counterparty_name: 'Landlord' });
    const { item } = await create();
    expect((await api(`/${item.id}/complete`, { method: 'POST', json: { transaction_id: uid() } })).status).toBe(400);
    await seedUser(OTHER);
    const theirs = await seedTransaction({ user_id: OTHER });
    expect((await api(`/${item.id}/complete`, { method: 'POST', json: { transaction_id: theirs } })).status).toBe(400);
    const gone = await seedTransaction({ deleted_at: '2026-10-30T00:00:00.000Z' });
    expect((await api(`/${item.id}/complete`, { method: 'POST', json: { transaction_id: gone } })).status).toBe(400);
    expect((await dbRow(item.id))?.['status']).toBe('open');
    expect((await api(`/${item.id}/complete`, { method: 'POST', json: { transaction_id: tx } })).status).toBe(200);
    expect(await dbRow(item.id)).toMatchObject({ status: 'done', completed_txn_id: tx });
  });

  it('completing twice changes nothing', async () => {
    const { item } = await create();
    await api(`/${item.id}/complete`, { method: 'POST', json: {} });
    vi.setSystemTime(NOW + 3_600_000);
    const again = await (await api(`/${item.id}/complete`, { method: 'POST', json: {} })).json<Reminder>();
    expect(again).toMatchObject({ status: 'done', completed_at: new Date(NOW).toISOString() });
  });

  it('a repeating reminder stays open and moves to the next occurrence, nothing sent yet', async () => {
    const id = await seedReminder({ cadence: 'monthly', due_date: '2026-11-10', fired_through: '2026-11-07T03:30:00.000Z', next_fire_at: '2026-11-09T03:30:00.000Z' });
    const res = await api(`/${id}/complete`, { method: 'POST', json: {} });
    expect(await res.json()).toMatchObject({ status: 'open', due_date: '2026-12-10', next_fire_at: '2026-12-07T03:30:00.000Z', completed_at: new Date(NOW).toISOString() });
    expect(await dbRow(id)).toMatchObject({ fired_through: null });
  });

  it('monthly on the 31st: Feb 28, back to Mar 31; weekly adds 7 days; yearly keeps the month; no backfill when completed late', async () => {
    vi.setSystemTime(Date.parse('2026-01-20T04:00:00Z'));
    const jan31 = await seedReminder({ cadence: 'monthly', due_date: '2026-01-31' });
    expect((await (await api(`/${jan31}/complete`, { method: 'POST', json: {} })).json<Reminder>()).due_date).toBe('2026-02-28');
    expect((await (await api(`/${jan31}/complete`, { method: 'POST', json: {} })).json<Reminder>()).due_date).toBe('2026-03-31');
    const weekly = await seedReminder({ cadence: 'weekly', due_date: '2026-01-23' });
    expect((await (await api(`/${weekly}/complete`, { method: 'POST', json: {} })).json<Reminder>()).due_date).toBe('2026-01-30');
    const yearly = await seedReminder({ cadence: 'yearly', due_date: '2026-03-05' });
    expect((await (await api(`/${yearly}/complete`, { method: 'POST', json: {} })).json<Reminder>()).due_date).toBe('2027-03-05');
    vi.setSystemTime(Date.parse('2026-06-20T04:00:00Z'));
    const late = await seedReminder({ cadence: 'monthly', due_date: '2026-03-10' });
    expect((await (await api(`/${late}/complete`, { method: 'POST', json: {} })).json<Reminder>()).due_date).toBe('2026-07-10');
  });

  it('404 for unknown or foreign ids', async () => {
    expect((await api(`/${uid()}/complete`, { method: 'POST', json: {} })).status).toBe(404);
    await seedUser(OTHER);
    const theirs = await seedReminder({ user_id: OTHER });
    expect((await api(`/${theirs}/complete`, { method: 'POST', json: {} })).status).toBe(404);
    expect((await dbRow(theirs))?.['status']).toBe('open');
  });
});

describe('POST /reminders/:id/skip', () => {
  it('moves a repeating reminder on without completing it', async () => {
    const id = await seedReminder({ cadence: 'weekly', due_date: '2026-11-03' });
    const res = await api(`/${id}/skip`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'open', due_date: '2026-11-10', completed_at: null, next_fire_at: '2026-11-07T03:30:00.000Z' });
  });

  it('refuses a one-off, a finished reminder, and other users’ reminders', async () => {
    const once = await seedReminder();
    expect((await api(`/${once}/skip`, { method: 'POST' })).status).toBe(400);
    const done = await seedReminder({ cadence: 'monthly', status: 'done' });
    expect((await api(`/${done}/skip`, { method: 'POST' })).status).toBe(400);
    expect((await api(`/${uid()}/skip`, { method: 'POST' })).status).toBe(404);
    await seedUser(OTHER);
    const theirs = await seedReminder({ user_id: OTHER, cadence: 'monthly' });
    expect((await api(`/${theirs}/skip`, { method: 'POST' })).status).toBe(404);
  });
});

describe('suggested_match ("looks paid")', () => {
  const landlord = (over: Record<string, unknown> = {}) => seedTransaction({ counterparty_name: 'Landlord', amount: '15000', type: 'debit', transaction_at: '2026-11-09T10:00:00.000Z', ...over });
  const matchOf = async (body: Record<string, unknown> = rent()) => (await create(body)).item.suggested_match;

  it('a pay reminder matches a debit with the same payee and amount, and says which', async () => {
    const tx = await landlord();
    expect(await matchOf()).toEqual({ transaction_id: tx, amount: '15000.00', display_name: 'Landlord', date: '2026-11-09' });
    expect((await list())[0]?.suggested_match?.transaction_id).toBe(tx);
  });

  it('a pay reminder ignores credits; a receive reminder matches credits only', async () => {
    await landlord({ type: 'credit' });
    expect(await matchOf()).toBeNull();
    const credit = await seedTransaction({ counterparty_name: 'Ravi', amount: '800', type: 'credit', transaction_at: '2026-11-11T10:00:00.000Z' });
    await seedTransaction({ counterparty_name: 'Ravi', amount: '800', type: 'debit', transaction_at: '2026-11-11T11:00:00.000Z' });
    expect((await matchOf(rent({ direction: 'receive', title: 'Ravi owes', amount: '800', counterparty_name: 'Ravi' })))?.transaction_id).toBe(credit);
  });

  it('amount only matches any payee; payee only matches any amount; neither never matches', async () => {
    const other = await seedTransaction({ counterparty_name: 'Someone else', amount: '15000', type: 'debit', transaction_at: '2026-11-09T10:00:00.000Z' });
    expect((await matchOf(rent({ counterparty_name: undefined })))?.transaction_id).toBe(other);
    const odd = await landlord({ amount: '12345.67' });
    expect((await matchOf(rent({ amount: undefined })))?.transaction_id).toBe(odd);
    expect(await matchOf(rent({ amount: undefined, counterparty_name: undefined }))).toBeNull();
  });

  it('both present: a wrong amount or a wrong payee does not match', async () => {
    await landlord({ amount: '14999' });
    await seedTransaction({ counterparty_name: 'Not the landlord', amount: '15000', type: 'debit', transaction_at: '2026-11-09T10:00:00.000Z' });
    expect(await matchOf()).toBeNull();
  });

  it('the window is [due - 7 days, due + 14 days] in local days: both edges, one second inside, one second out', async () => {
    const inFirst = await landlord({ transaction_at: '2026-11-02T18:30:00.000Z' }); // 3 Nov 00:00 IST
    expect((await matchOf())?.transaction_id).toBe(inFirst);
    await testDb().prepare('DELETE FROM transactions').run();
    await landlord({ transaction_at: '2026-11-02T18:29:59.000Z' }); // 2 Nov 23:59:59 IST
    expect(await matchOf()).toBeNull();
    await testDb().prepare('DELETE FROM transactions').run();
    const inLast = await landlord({ transaction_at: '2026-11-24T18:29:59.000Z' }); // 24 Nov 23:59:59 IST
    expect((await matchOf())?.transaction_id).toBe(inLast);
    await testDb().prepare('DELETE FROM transactions').run();
    await landlord({ transaction_at: '2026-11-24T18:30:00.000Z' }); // 25 Nov 00:00 IST
    expect(await matchOf()).toBeNull();
  });

  it('deleted transactions and other users’ transactions are ignored', async () => {
    await landlord({ deleted_at: '2026-11-10T00:00:00.000Z' });
    await seedUser(OTHER);
    await landlord({ user_id: OTHER });
    expect(await matchOf()).toBeNull();
  });

  it('the transaction closest to the due date wins', async () => {
    await landlord({ transaction_at: '2026-11-04T10:00:00.000Z' });
    const closer = await landlord({ transaction_at: '2026-11-09T10:00:00.000Z' });
    await landlord({ transaction_at: '2026-11-20T10:00:00.000Z' });
    expect((await matchOf())?.transaction_id).toBe(closer);
  });

  it('a transaction that already completed a reminder is not suggested again; finished reminders carry no suggestion', async () => {
    const tx = await landlord();
    await seedReminder({ title: 'Last month', status: 'done', completed_txn_id: tx, counterparty_name: 'Landlord', amount: '15000', due_date: '2026-10-10' });
    expect(await matchOf()).toBeNull();
    const fresh = await landlord({ transaction_at: '2026-11-08T10:00:00.000Z' });
    expect((await matchOf())?.transaction_id).toBe(fresh);
    expect((await list('?status=done'))[0]?.suggested_match).toBeNull();
  });

  it('cannot drop a real match: >1000 rows of a common amount across a year-spanning window', async () => {
    // Two reminders a year apart share the amount; 1100 other 100.00 debits sit between them (outside both windows).
    const jan = await seedReminder({ title: 'January bill', amount: '100', due_date: '2026-01-10' });
    const dec = await seedReminder({ title: 'December bill', amount: '100', due_date: '2026-12-20' });
    await testDb()
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1100)
         INSERT INTO transactions (id, user_id, amount, type, detected_via, transaction_at, payee_key)
         SELECT printf('f%05d', i), ?, 10000, 'debit', 'manual', strftime('%Y-%m-%dT%H:%M:%fZ', '2026-03-01', '+' || i || ' hours'), 'filler' FROM n`,
      )
      .bind(USER_ID)
      .run();
    const early = await seedTransaction({ counterparty_name: 'Utility', amount: '100', transaction_at: '2026-01-09T10:00:00.000Z' });
    const late = await seedTransaction({ counterparty_name: 'Utility', amount: '100', transaction_at: '2026-12-19T10:00:00.000Z' });
    const items = await list();
    expect(items.find((r) => r.id === jan)?.suggested_match?.transaction_id).toBe(early);
    expect(items.find((r) => r.id === dec)?.suggested_match?.transaction_id).toBe(late);
  });

  it('more reminders than one statement carries are all matched (chunked)', async () => {
    await testDb()
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 150)
         INSERT INTO reminders (id, user_id, direction, title, amount, due_date, anchor_day, timezone)
         SELECT printf('r%05d', i), ?, 'pay', 'Bill ' || i, i * 100, '2026-11-10', 10, 'Asia/Kolkata' FROM n`,
      )
      .bind(USER_ID)
      .run();
    const tx = await seedTransaction({ counterparty_name: 'Utility', amount: '140', transaction_at: '2026-11-09T10:00:00.000Z' });
    const hits = (await list('?limit=200')).filter((r) => r.suggested_match);
    expect(hits.map((r) => [r.title, r.suggested_match?.transaction_id])).toEqual([['Bill 140', tx]]);
  });

  it('a transaction used for an earlier occurrence never comes back, even when the next completion linked nothing', async () => {
    const id = await seedReminder({ cadence: 'weekly', due_date: '2026-11-03', amount: '15000', counterparty_name: 'Landlord' });
    const paid = await seedTransaction({ counterparty_name: 'Landlord', amount: '15000', transaction_at: '2026-11-12T10:00:00.000Z' });
    expect((await (await api(`/${id}/complete`, { method: 'POST', json: { transaction_id: paid } })).json<Reminder>()).due_date).toBe('2026-11-10');
    // Completed again without a transaction (a single completed_txn_id would forget `paid` now): due 17 Nov, whose window still holds it.
    const again = await (await api(`/${id}/complete`, { method: 'POST', json: {} })).json<Reminder>();
    expect(again).toMatchObject({ due_date: '2026-11-17', suggested_match: null });
    expect(JSON.parse((await dbRow(id))?.['used_txn_ids'] as string)).toEqual([paid]);
    // A different payment in the same window is still suggested.
    const next = await seedTransaction({ counterparty_name: 'Landlord', amount: '15000', transaction_at: '2026-11-13T10:00:00.000Z' });
    expect((await list())[0]?.suggested_match?.transaction_id).toBe(next);
  });

  it('keeps only the latest ten used transactions', async () => {
    const id = await seedReminder({ cadence: 'weekly', due_date: '2026-11-03', amount: '1' });
    const ids: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      ids.push(await seedTransaction({ counterparty_name: `P${i}`, amount: '5' }));
      await api(`/${id}/complete`, { method: 'POST', json: { transaction_id: ids[i] } });
    }
    expect(JSON.parse((await dbRow(id))?.['used_txn_ids'] as string)).toEqual(ids.slice(-10));
  });

  it('a whole list costs ONE transactions query, however many reminders', async () => {
    for (let i = 0; i < 5; i += 1) await seedReminder({ title: `R${i}`, amount: String(100 + i), counterparty_name: `Payee ${i}` });
    const { db, sqls } = spyDb();
    const { items } = await listReminders(db, USER_ID, { status: 'open', limit: 100 });
    expect(items).toHaveLength(5);
    expect(sqls.filter((s) => /JOIN transactions/.test(s))).toHaveLength(1);
  });
});

describe('lead days and the cadence', () => {
  const lead = async (cadence: string, lead_days: number[]) => create(rent({ cadence, lead_days }));

  it('weekly reminders allow up to 6 days ahead, monthly and yearly up to 27, one-offs 30', async () => {
    for (const [cadence, ok, bad, cap] of [['weekly', 6, 7, 6], ['monthly', 27, 28, 27], ['yearly', 27, 28, 27], ['none', 30, 31, 30]] as const) {
      expect((await lead(cadence, [ok])).res.status, `${cadence} ${ok}`).toBe(201);
      const { res, json } = await lead(cadence, [bad]);
      expect(res.status, `${cadence} ${bad}`).toBe(422);
      if (cadence !== 'none') expect(JSON.stringify(json)).toContain(`at most ${cap}`); // (a one-off's 30 is the schema's own limit)
    }
  });

  it('the message names the cadence and the limit', async () => {
    const { json } = await lead('weekly', [7]);
    expect(json).toEqual({ detail: [{ type: 'value_error', loc: ['body', 'lead_days'], msg: 'Value error, lead days of a weekly reminder can be at most 6' }] });
  });

  it('PATCH checks the merged reminder: new lead days, or a narrower cadence over the stored ones', async () => {
    const { item } = await create(rent({ cadence: 'monthly', lead_days: [20] }));
    expect((await api(`/${item.id}`, { method: 'PATCH', json: { lead_days: [28] } })).status).toBe(422);
    expect((await api(`/${item.id}`, { method: 'PATCH', json: { cadence: 'weekly' } })).status).toBe(422); // stored 20 no longer fits
    expect((await api(`/${item.id}`, { method: 'PATCH', json: { cadence: 'weekly', lead_days: [2] } })).status).toBe(200);
    expect((await api(`/${item.id}`, { method: 'PATCH', json: { lead_days: null, cadence: 'monthly' } })).status).toBe(200);
    expect((await dbRow(item.id))?.['lead_days']).toBeNull();
  });

  it('a default lead day beyond the cadence is ignored for that reminder, not an error', async () => {
    await seedSettings({ reminder_default_lead_days: '[9,3]' });
    const weekly = (await create(rent({ cadence: 'weekly' }))).item;
    expect(weekly.effective_lead_days).toEqual([9, 3]);
    expect(weekly.next_fire_at).toBe('2026-11-07T03:30:00.000Z'); // 3 days before; the 9 (1 Nov) is skipped
    expect((await create(rent())).item.next_fire_at).toBe('2026-11-01T03:30:00.000Z'); // a one-off keeps the 9
  });
});

describe('changing reminder settings re-plans what is already scheduled', () => {
  const setSettings = (json: Record<string, unknown>) => call('/api/v1/me/settings', { method: 'PATCH', json, env: makeEnv({ WRITE_LIMITER: undefined }) });
  const nextFire = async (id: string) => (await dbRow(id))?.['next_fire_at'];

  it('moving the reminder time earlier moves next_fire_at; fired_through is kept', async () => {
    const open = await seedReminder({ due_date: '2026-11-10', next_fire_at: '2026-11-07T03:30:00.000Z' });
    const sent = await seedReminder({ due_date: '2026-11-10', fired_through: '2026-11-07T03:30:00.000Z', next_fire_at: '2026-11-09T03:30:00.000Z' });
    expect((await setSettings({ reminder_time: '07:00' })).status).toBe(200);
    expect(await nextFire(open)).toBe('2026-11-07T01:30:00.000Z'); // 07:00 IST
    expect(await nextFire(sent)).toBe('2026-11-09T01:30:00.000Z');
    expect(await dbRow(sent)).toMatchObject({ fired_through: '2026-11-07T03:30:00.000Z' });
  });

  it('adding an earlier default lead day applies; so do quiet hours; a reminder with its own lead days keeps them', async () => {
    const byDefault = await seedReminder({ due_date: '2026-11-20', next_fire_at: '2026-11-17T03:30:00.000Z' });
    const own = await seedReminder({ due_date: '2026-11-20', lead_days: [2], next_fire_at: '2026-11-18T03:30:00.000Z' });
    await setSettings({ reminder_default_lead_days: [14, 3, 1, 0] });
    expect(await nextFire(byDefault)).toBe('2026-11-06T03:30:00.000Z'); // 20 Nov - 14 days
    expect(await nextFire(own)).toBe('2026-11-18T03:30:00.000Z');
    await setSettings({ reminder_time: '23:00', reminder_quiet_enabled: true });
    expect(await nextFire(byDefault)).toBe('2026-11-07T02:30:00.000Z'); // 6 Nov 23:00 is quiet: 08:00 IST on the 7th
  });

  it('recurring items with lead days are re-planned too', async () => {
    const res = await call('/api/v1/recurring', {
      method: 'POST',
      json: { kind: 'subscription', name: 'Netflix', amount: '649', cadence: 'monthly', day_of_month: 20, timezone: IST, remind_lead_days: [3, 1] },
      env: makeEnv({ WRITE_LIMITER: undefined }),
    });
    const { id } = await res.json<{ id: string }>();
    const next = async () => (await oneRow<Record<string, unknown>>('recurring_items', 'id = ?', id))?.['next_remind_at'];
    expect(await next()).toBe('2026-11-17T03:30:00.000Z');
    await setSettings({ reminder_time: '07:00' });
    expect(await next()).toBe('2026-11-17T01:30:00.000Z');
  });

  it('leaves done reminders, other users and unrelated settings alone', async () => {
    await seedUser(OTHER);
    const done = await seedReminder({ status: 'done', next_fire_at: '2030-01-01T00:00:00.000Z' });
    const theirs = await seedReminder({ user_id: OTHER, due_date: '2026-11-10', next_fire_at: '2030-01-01T00:00:00.000Z' });
    const mine = await seedReminder({ due_date: '2026-11-10', next_fire_at: '2030-01-01T00:00:00.000Z' });
    await setSettings({ upi_id: 'me@okhdfc', budget_alerts_enabled: false }); // not reminder settings
    expect(await nextFire(mine)).toBe('2030-01-01T00:00:00.000Z');
    await setSettings({ reminder_overdue_nudges: 1 });
    expect(await nextFire(mine)).toBe('2026-11-07T03:30:00.000Z'); // re-planned
    expect(await nextFire(done)).toBe('2030-01-01T00:00:00.000Z');
    expect(await nextFire(theirs)).toBe('2030-01-01T00:00:00.000Z');
  });

  it('timezone and the reminders switch re-plan as well', async () => {
    const id = await seedReminder({ due_date: '2026-11-10', next_fire_at: '2030-01-01T00:00:00.000Z' });
    expect((await setSettings({ timezone: 'Asia/Kolkata' })).status).toBe(200);
    expect(await nextFire(id)).toBe('2026-11-07T03:30:00.000Z');
    await testDb().prepare('UPDATE reminders SET next_fire_at = ?').bind('2030-01-01T00:00:00.000Z').run();
    await setSettings({ reminders_enabled: false });
    expect(await nextFire(id)).toBe('2026-11-07T03:30:00.000Z');
  });
});
