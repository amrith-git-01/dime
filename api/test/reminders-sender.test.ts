import { afterEach, describe, expect, it, vi } from 'vitest';

import worker from '../src/index';
import { postDueRecurring } from '../src/features/recurring/poster';
import { TICK_CAP, sendDueReminders } from '../src/features/reminders/sender';
import type { PushSender } from '../src/features/notifications/emitter';
import { USER_ID, call, makeCtx, makeEnv } from './helpers';
import { oneRow, rowsOf, seedPushToken, seedReminder, seedSettings, testDb } from './db';

afterEach(() => vi.useRealTimers());

const at = (iso: string) => Date.parse(iso);
type Row = Record<string, unknown>;

/** A push sender that records what it was asked to send. */
function fakePush() {
  const send = vi.fn<PushSender>(() => Promise.resolve());
  return { send, calls: () => send.mock.calls.map(([input]) => input) };
}

const notifications = () => rowsOf<Row>('notifications');
const reminder = (id: string) => oneRow<Row>('reminders', 'id = ?', id);

/** The ordinary case: rent due 10 Nov, 3 days ahead is the first instant (09:00 IST = 03:30Z). */
const seedRent = (over: Parameters<typeof seedReminder>[0] = {}) =>
  seedReminder({ title: 'Rent', amount: '15000', counterparty_name: 'Landlord', due_date: '2026-11-10', next_fire_at: '2026-11-07T03:30:00.000Z', ...over });

describe('sendDueReminders: reminders', () => {
  it('sends the due step as a reminder_due notification and push, then moves to the next instant', async () => {
    const id = await seedRent();
    await seedPushToken('ExponentPushToken[a]');
    const push = fakePush();

    const early = await sendDueReminders(makeEnv(), at('2026-11-07T03:29:59Z'), { pushSend: push.send });
    expect(early.reminders).toEqual({ due: 0, sent: 0, failed: 0 });
    expect(await notifications()).toHaveLength(0);

    const result = await sendDueReminders(makeEnv(), at('2026-11-07T03:31:00Z'), { pushSend: push.send });
    expect(result.reminders).toEqual({ due: 1, sent: 1, failed: 0 });
    expect(await notifications()).toEqual([
      expect.objectContaining({
        user_id: USER_ID,
        kind: 'reminder_due',
        title: 'Rent due in 3 days',
        body: '₹15,000 to Landlord',
        action_type: 'reminder',
        action_transaction_id: null,
        action_reminder_id: id,
        action_period_key: null,
        dedupe_key: `reminder:${id}:2026-11-10:l3`,
      }),
    ]);
    const note = (await notifications())[0] as Row;
    expect(push.calls()).toEqual([
      {
        tokens: ['ExponentPushToken[a]'],
        title: 'Rent due in 3 days',
        body: '₹15,000 to Landlord',
        data: { notification_id: note['id'], kind: 'reminder_due', action_type: 'reminder', action_transaction_id: null, reminder_id: id },
        onInvalidToken: expect.any(Function) as unknown,
      },
    ]);
    expect(await reminder(id)).toMatchObject({ status: 'open', due_date: '2026-11-10', fired_through: '2026-11-07T03:30:00.000Z', next_fire_at: '2026-11-09T03:30:00.000Z' });
  });

  it('the inbox answers the reminder action with its id', async () => {
    const id = await seedRent();
    await sendDueReminders(makeEnv(), at('2026-11-07T04:00:00Z'), { pushSend: fakePush().send });
    const res = await call('/api/v1/notifications');
    const body = await res.json<{ items: { kind: string; action: Record<string, unknown> }[] }>();
    expect(body.items).toEqual([expect.objectContaining({ kind: 'reminder_due', action: { type: 'reminder', transaction_id: null, reminder_id: id } })]);
  });

  it('running again, even after the row is put back, sends nothing twice (dedupe key)', async () => {
    const id = await seedRent();
    await seedPushToken('ExponentPushToken[a]');
    const push = fakePush();
    const now = at('2026-11-07T04:00:00Z');
    await sendDueReminders(makeEnv(), now, { pushSend: push.send });
    expect((await sendDueReminders(makeEnv(), now, { pushSend: push.send })).reminders.due).toBe(0);

    // A crash between emit and advance: the row is still on the instant it already sent.
    await testDb().prepare("UPDATE reminders SET fired_through = NULL, next_fire_at = '2026-11-07T03:30:00.000Z' WHERE id = ?").bind(id).run();
    const again = await sendDueReminders(makeEnv(), now, { pushSend: push.send });
    expect(again.reminders.due).toBe(1);
    expect(await notifications()).toHaveLength(1);
    expect(push.send).toHaveBeenCalledTimes(1);
    expect(await reminder(id)).toMatchObject({ fired_through: '2026-11-07T03:30:00.000Z', next_fire_at: '2026-11-09T03:30:00.000Z' });
  });

  it('when the cron missed several instants only the latest is sent', async () => {
    const id = await seedRent();
    await sendDueReminders(makeEnv(), at('2026-11-10T05:00:00Z'), { pushSend: fakePush().send });
    expect(await notifications()).toEqual([expect.objectContaining({ title: 'Rent due today', dedupe_key: `reminder:${id}:2026-11-10:l0` })]);
    expect(await reminder(id)).toMatchObject({ fired_through: '2026-11-10T03:30:00.000Z', next_fire_at: '2026-11-11T03:30:00.000Z' });
  });

  it('only reminders whose instant has arrived, only open ones, oldest first, capped per run', async () => {
    await seedRent({ title: 'Future', next_fire_at: '2026-11-08T00:00:00.000Z' });
    await seedRent({ title: 'Done', status: 'done', next_fire_at: '2026-11-01T00:00:00.000Z' });
    await seedRent({ title: 'Nothing left', next_fire_at: null });
    const first = await seedRent({ title: 'First', next_fire_at: '2026-11-02T00:00:00.000Z', due_date: '2026-11-04' });
    const result = await sendDueReminders(makeEnv(), at('2026-11-07T04:00:00Z'), { pushSend: fakePush().send });
    expect(result.reminders.due).toBe(1);
    expect(await notifications()).toEqual([expect.objectContaining({ action_reminder_id: first })]);
  });

  it('nudges for a missed due date say how late it is; a receive reminder names the person and the amount', async () => {
    await seedRent({ fired_through: '2026-11-10T03:30:00.000Z', next_fire_at: '2026-11-11T03:30:00.000Z' });
    await seedReminder({
      direction: 'receive',
      title: 'Ravi owes',
      amount: '800',
      counterparty_name: 'Ravi',
      due_date: '2026-11-10',
      fired_through: '2026-11-10T03:30:00.000Z',
      next_fire_at: '2026-11-11T03:30:00.000Z',
    });
    await sendDueReminders(makeEnv(), at('2026-11-11T04:00:00Z'), { pushSend: fakePush().send });
    const rows = await notifications();
    expect(rows.map((n) => [n['title'], n['body']]).sort()).toEqual([
      ["Ravi's ₹800 is 1 day late", '₹800 from Ravi'],
      ['Rent is 1 day overdue', '₹15,000 to Landlord'],
    ]);
  });

  it('receive copy before the due date, and no amount or name', async () => {
    await seedReminder({ direction: 'receive', title: 'Salary', due_date: '2026-11-10', lead_days: [2], next_fire_at: '2026-11-08T03:30:00.000Z' });
    await sendDueReminders(makeEnv(), at('2026-11-08T04:00:00Z'), { pushSend: fakePush().send });
    expect((await notifications()).map((n) => [n['title'], n['body']])).toEqual([['Salary expected in 2 days', 'Open Dime for details.']]);
  });

  it('with reminders switched off nothing is sent but the schedule still moves', async () => {
    await seedSettings({ reminders_enabled: 0 });
    await seedPushToken('ExponentPushToken[a]');
    const push = fakePush();
    const id = await seedRent();
    const result = await sendDueReminders(makeEnv(), at('2026-11-07T04:00:00Z'), { pushSend: push.send });
    expect(result.reminders).toEqual({ due: 1, sent: 0, failed: 0 });
    expect(await notifications()).toHaveLength(0);
    expect(push.send).not.toHaveBeenCalled();
    expect(await reminder(id)).toMatchObject({ fired_through: '2026-11-07T03:30:00.000Z', next_fire_at: '2026-11-09T03:30:00.000Z' });
  });

  it('with device notifications off the inbox row exists but no push goes out', async () => {
    await seedSettings({ device_notifications_enabled: 0 });
    await seedPushToken('ExponentPushToken[a]');
    const push = fakePush();
    await seedRent();
    await sendDueReminders(makeEnv(), at('2026-11-07T04:00:00Z'), { pushSend: push.send });
    expect(await notifications()).toHaveLength(1);
    expect(push.send).not.toHaveBeenCalled();
  });

  it('hide amounts keeps the figure out of the title and the body', async () => {
    await seedSettings({ reminder_hide_amounts: 1 });
    await seedRent();
    await seedReminder({ direction: 'receive', title: 'Ravi owes', amount: '800', counterparty_name: 'Ravi', fired_through: '2026-11-10T03:30:00.000Z', next_fire_at: '2026-11-11T03:30:00.000Z' });
    await sendDueReminders(makeEnv(), at('2026-11-11T04:00:00Z'), { pushSend: fakePush().send });
    const rows = await notifications();
    expect(rows.map((n) => [n['title'], n['body']]).sort()).toEqual([
      ["Ravi's payment is 1 day late", 'Open Dime to see the amount.'],
      ['Rent is 1 day overdue', 'Open Dime to see the amount.'],
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/₹/);
  });

  it('the last step of a one-off leaves nothing to send; the reminder stays open', async () => {
    const id = await seedRent({ fired_through: '2026-11-11T03:30:00.000Z', next_fire_at: '2026-11-12T03:30:00.000Z' });
    await sendDueReminders(makeEnv(), at('2026-11-12T04:00:00Z'), { pushSend: fakePush().send });
    expect(await notifications()).toEqual([expect.objectContaining({ title: 'Rent is 2 days overdue' })]);
    expect(await reminder(id)).toMatchObject({ status: 'open', due_date: '2026-11-10', fired_through: '2026-11-12T03:30:00.000Z', next_fire_at: null });
    expect((await sendDueReminders(makeEnv(), at('2026-12-01T00:00:00Z'), { pushSend: fakePush().send })).reminders.due).toBe(0);
  });

  it('a repeating reminder rolls on after its last step: new due date, nothing sent yet, next instant ahead', async () => {
    const id = await seedRent({ cadence: 'monthly', fired_through: '2026-11-11T03:30:00.000Z', next_fire_at: '2026-11-12T03:30:00.000Z' });
    await sendDueReminders(makeEnv(), at('2026-11-12T04:00:00Z'), { pushSend: fakePush().send });
    // The last nudge went out; the roll (the start of 13 Nov IST) is next.
    expect(await reminder(id)).toMatchObject({ due_date: '2026-11-10', fired_through: '2026-11-12T03:30:00.000Z', next_fire_at: '2026-11-12T18:30:00.000Z' });

    const rolled = await sendDueReminders(makeEnv(), at('2026-11-12T18:31:00Z'), { pushSend: fakePush().send });
    expect(rolled.reminders).toEqual({ due: 1, sent: 0, failed: 0 });
    expect(await notifications()).toHaveLength(1); // the roll sends nothing
    expect(await reminder(id)).toMatchObject({ due_date: '2026-12-10', fired_through: null, next_fire_at: '2026-12-07T03:30:00.000Z' });
  });

  it('a monthly reminder anchored on the 31st clamps in short months', async () => {
    const id = await seedReminder({ cadence: 'monthly', due_date: '2026-01-31', anchor_day: 31, fired_through: '2026-02-02T03:30:00.000Z', next_fire_at: '2026-02-02T18:30:00.000Z' });
    await sendDueReminders(makeEnv(), at('2026-02-02T19:00:00Z'), { pushSend: fakePush().send });
    expect(await reminder(id)).toMatchObject({ due_date: '2026-02-28', fired_through: null });
  });

  it('settings changed since scheduling: a row that is not really due yet only gets its new instant', async () => {
    await seedSettings({ reminder_time: '20:00' });
    const id = await seedRent(); // scheduled for 09:00, the user now wants 20:00
    const result = await sendDueReminders(makeEnv(), at('2026-11-07T04:00:00Z'), { pushSend: fakePush().send });
    expect(result.reminders).toEqual({ due: 1, sent: 0, failed: 0 });
    expect(await notifications()).toHaveLength(0);
    expect(await reminder(id)).toMatchObject({ fired_through: null, next_fire_at: '2026-11-07T14:30:00.000Z' });
  });

  it('one failing reminder does not block the others, and is retried on the next run', async () => {
    const real = testDb();
    let tripped = false;
    const flaky = new Proxy(real, {
      get(target, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            if (!tripped && /INSERT INTO notifications/.test(sql)) {
              tripped = true;
              throw new Error('D1_ERROR: boom');
            }
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    const a = await seedRent({ title: 'A', next_fire_at: '2026-11-07T03:00:00.000Z' });
    const b = await seedRent({ title: 'B', next_fire_at: '2026-11-07T03:10:00.000Z' });
    const now = at('2026-11-07T04:00:00Z');

    const result = await sendDueReminders(makeEnv({ DB: flaky }), now, { pushSend: fakePush().send });
    expect(result.reminders).toEqual({ due: 2, sent: 1, failed: 1 });
    expect(await notifications()).toEqual([expect.objectContaining({ action_reminder_id: b })]);
    expect(await reminder(a)).toMatchObject({ fired_through: null, next_fire_at: '2026-11-07T03:00:00.000Z' }); // untouched

    const retry = await sendDueReminders(makeEnv(), now, { pushSend: fakePush().send });
    expect(retry.reminders).toMatchObject({ due: 1, sent: 1, failed: 0 });
    expect((await notifications()).map((n) => n['action_reminder_id']).sort()).toEqual([a, b].sort());
  });

  it('the */5 cron runs it', async () => {
    const id = await seedRent();
    const scheduledTime = at('2026-11-07T04:00:00Z');
    await worker.scheduled({ cron: '*/5 * * * *', scheduledTime, type: 'scheduled', noRetry: () => undefined } as ScheduledController, makeEnv(), makeCtx().ctx);
    expect(await notifications()).toEqual([expect.objectContaining({ action_reminder_id: id })]);
  });
});

describe('sendDueReminders: the per-tick cap', () => {
  const NOW = at('2026-11-07T04:00:00Z');
  const seedReminders = (n: number) =>
    testDb()
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${n})
         INSERT INTO reminders (id, user_id, direction, title, due_date, anchor_day, timezone, next_fire_at)
         SELECT printf('r%05d', i), ?, 'pay', 'Bill ' || i, '2026-11-10', 10, 'Asia/Kolkata', '2026-11-07T03:00:00.000Z' FROM n`,
      )
      .bind(USER_ID)
      .run();
  const seedItems = (n: number) =>
    testDb()
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${n})
         INSERT INTO recurring_items (id, user_id, kind, name, amount, cadence, day_of_month, timezone, next_due_date, active, remind_lead_days, next_remind_at)
         SELECT printf('i%05d', i), ?, 'subscription', 'Sub ' || i, 10000, 'monthly', 10, 'Asia/Kolkata', '2026-11-10', 1, '[3]', '2026-11-07T03:00:00.000Z' FROM n`,
      )
      .bind(USER_ID)
      .run();

  it('handles at most 60 rows a tick and reports what is left; the next tick takes the rest', async () => {
    expect(TICK_CAP).toBe(60);
    await seedReminders(70);
    const first = await sendDueReminders(makeEnv(), NOW, { pushSend: fakePush().send });
    expect(first.reminders).toEqual({ due: 60, sent: 60, failed: 0 });
    expect(first.leftover).toEqual({ reminders: 10, recurring: 0 });
    expect(await notifications()).toHaveLength(60);

    const second = await sendDueReminders(makeEnv(), NOW, { pushSend: fakePush().send });
    expect(second.reminders.due).toBe(10);
    expect(second.leftover).toEqual({ reminders: 0, recurring: 0 });
    expect(await notifications()).toHaveLength(70);
  }, 60_000);

  it('reminders go first and recurring items get what is left of the 60', async () => {
    await seedReminders(50);
    await seedItems(20);
    const result = await sendDueReminders(makeEnv(), NOW, { pushSend: fakePush().send });
    expect([result.reminders.due, result.recurring.due]).toEqual([50, 10]);
    expect(result.leftover).toEqual({ reminders: 0, recurring: 10 });
    expect(await notifications()).toHaveLength(60);
    expect((await sendDueReminders(makeEnv(), NOW, { pushSend: fakePush().send })).recurring.due).toBe(10);
  }, 60_000);

  it('a full tick of reminders leaves every recurring item for the next one', async () => {
    await seedReminders(60);
    await seedItems(5);
    const result = await sendDueReminders(makeEnv(), NOW, { pushSend: fakePush().send });
    expect([result.reminders.due, result.recurring.due]).toEqual([60, 0]);
    expect(result.leftover).toEqual({ reminders: 0, recurring: 5 });
  }, 60_000);
});

describe('sendDueReminders: recurring items with lead-day reminders', () => {
  const setNow = (iso: string) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(iso));
  };
  const item = (over: Record<string, unknown> = {}) => ({
    kind: 'subscription',
    name: 'Netflix',
    amount: '649',
    cadence: 'monthly',
    day_of_month: 1,
    timezone: 'Asia/Kolkata',
    remind_lead_days: [3, 1],
    ...over,
  });
  async function createItem(body: Record<string, unknown> = item()) {
    const res = await call('/api/v1/recurring', { method: 'POST', json: body, env: makeEnv({ WRITE_LIMITER: undefined }) });
    expect(res.status).toBe(201);
    return res.json<{ id: string; remind_lead_days: number[] | null; next_due_date: string }>();
  }
  const nextRemind = async (id: string) => (await oneRow<Row>('recurring_items', 'id = ?', id))?.['next_remind_at'];

  it('create plans the first lead-day instant; the API returns and accepts remind_lead_days', async () => {
    setNow('2026-10-25T05:00:00Z');
    const created = await createItem();
    expect(created).toMatchObject({ remind_lead_days: [3, 1], next_due_date: '2026-11-01' });
    expect(await nextRemind(created.id)).toBe('2026-10-29T03:30:00.000Z'); // 3 days before, 09:00 IST

    const off = await createItem(item({ name: 'Plain', remind_lead_days: undefined }));
    expect(off.remind_lead_days).toBeNull();
    expect(await nextRemind(off.id)).toBeNull();

    const bad = await call('/api/v1/recurring', { method: 'POST', json: item({ remind_lead_days: [31] }), env: makeEnv({ WRITE_LIMITER: undefined }) });
    expect(bad.status).toBe(422);
    const list = await (await call('/api/v1/recurring')).json<{ items: { name: string; remind_lead_days: number[] | null }[] }>();
    expect(list.items.map((i) => [i.name, i.remind_lead_days]).sort()).toEqual([['Netflix', [3, 1]], ['Plain', null]]);
  });

  it('sends each lead step in turn, keyed by item and due date, and stops after the last', async () => {
    setNow('2026-10-25T05:00:00Z');
    const { id } = await createItem();
    const push = fakePush();

    const first = await sendDueReminders(makeEnv(), at('2026-10-29T03:31:00Z'), { pushSend: push.send });
    expect(first.recurring).toEqual({ due: 1, sent: 1, failed: 0 });
    expect(await notifications()).toEqual([
      expect.objectContaining({ kind: 'reminder_due', title: 'Netflix due in 3 days', body: '₹649', action_type: 'reminder', action_reminder_id: null, dedupe_key: `reminder:rec:${id}:2026-11-01:l3` }),
    ]);
    expect(await nextRemind(id)).toBe('2026-10-31T03:30:00.000Z');

    await sendDueReminders(makeEnv(), at('2026-10-31T03:31:00Z'), { pushSend: push.send });
    expect((await notifications()).map((n) => n['title'])).toEqual(['Netflix due in 3 days', 'Netflix due in 1 day']);
    expect(await nextRemind(id)).toBeNull();
    expect((await sendDueReminders(makeEnv(), at('2026-11-01T00:00:00Z'), { pushSend: push.send })).recurring.due).toBe(0);
  });

  it('income reads as expected money; the push data carries no reminder id', async () => {
    setNow('2026-10-25T05:00:00Z');
    await createItem(item({ kind: 'income', name: 'Salary', amount: '50000', remind_lead_days: [3] }));
    await seedPushToken('ExponentPushToken[a]');
    const push = fakePush();
    await sendDueReminders(makeEnv(), at('2026-10-29T03:31:00Z'), { pushSend: push.send });
    expect((await notifications()).map((n) => [n['title'], n['body']])).toEqual([['Salary expected in 3 days', '₹50,000']]);
    expect(push.calls()[0]?.data).toEqual({ notification_id: expect.any(String) as unknown, kind: 'reminder_due', action_type: 'reminder', action_transaction_id: null });
  });

  it('cron down: only the latest due step is sent', async () => {
    setNow('2026-10-25T05:00:00Z');
    const { id } = await createItem();
    await sendDueReminders(makeEnv(), at('2026-10-31T12:00:00Z'), { pushSend: fakePush().send });
    expect((await notifications()).map((n) => n['title'])).toEqual(['Netflix due in 1 day']);
    expect(await nextRemind(id)).toBeNull();
  });

  it('recurring lead days are 1..30: 0 is refused (the poster posts the item at 06:00 on the due day itself)', async () => {
    setNow('2026-10-25T05:00:00Z');
    const post = (remind_lead_days: number[]) => call('/api/v1/recurring', { method: 'POST', json: item({ remind_lead_days }), env: makeEnv({ WRITE_LIMITER: undefined }) });
    for (const bad of [[0], [3, 0], [31], [1, 1], [1, 2, 3, 4, 5, 6]]) expect((await post(bad)).status, JSON.stringify(bad)).toBe(422);
    expect((await post([1, 30])).status).toBe(201);
    const { id } = await createItem();
    const patch = (remind_lead_days: number[]) => call('/api/v1/recurring/' + id, { method: 'PATCH', json: { remind_lead_days }, env: makeEnv({ WRITE_LIMITER: undefined }) });
    expect((await patch([0])).status).toBe(422);
    expect((await patch([2])).status).toBe(200);
  });

  it('a step quiet hours push to the poster\'s 06:00 on the due day or later is dropped', async () => {
    await seedSettings({ reminder_time: '23:00', reminder_quiet_enabled: 1 }); // quiet 22:00-08:00
    setNow('2026-10-25T05:00:00Z');
    const { id } = await createItem(); // due 1 Nov, leads 3 and 1
    // 29 Oct 23:00 is quiet: 08:00 IST on the 30th. 31 Oct 23:00 would become 08:00 IST on 1 Nov, after the item is posted (06:00).
    expect(await nextRemind(id)).toBe('2026-10-30T02:30:00.000Z');
    await sendDueReminders(makeEnv(), at('2026-10-30T02:31:00Z'), { pushSend: fakePush().send });
    expect((await notifications()).map((n) => n['title'])).toEqual(['Netflix due in 2 days']);
    expect(await nextRemind(id)).toBeNull();
  });

  it('honours the reminders switch and hide amounts', async () => {
    setNow('2026-10-25T05:00:00Z');
    const { id } = await createItem();
    await seedSettings({ reminders_enabled: 0 });
    await sendDueReminders(makeEnv(), at('2026-10-29T03:31:00Z'), { pushSend: fakePush().send });
    expect(await notifications()).toHaveLength(0);
    expect(await nextRemind(id)).toBe('2026-10-31T03:30:00.000Z'); // still moves on

    await testDb().prepare('UPDATE user_settings SET reminders_enabled = 1, reminder_hide_amounts = 1').run();
    await sendDueReminders(makeEnv(), at('2026-10-31T03:31:00Z'), { pushSend: fakePush().send });
    expect((await notifications()).map((n) => n['body'])).toEqual(['Open Dime to see the amount.']);
  });

  it('PATCH keeps next_remind_at in step: lead days, pausing, resuming, a new day of month', async () => {
    setNow('2026-10-25T05:00:00Z');
    const { id } = await createItem();
    const patch = async (json: Record<string, unknown>) => {
      const res = await call(`/api/v1/recurring/${id}`, { method: 'PATCH', json, env: makeEnv({ WRITE_LIMITER: undefined }) });
      expect(res.status).toBe(200);
      return res.json<{ remind_lead_days: number[] | null; next_due_date: string }>();
    };

    expect((await patch({ remind_lead_days: [7] })).remind_lead_days).toEqual([7]);
    expect(await nextRemind(id)).toBeNull(); // 7 days before 1 Nov was 25 Oct 09:00 IST: already past
    await patch({ remind_lead_days: [2] });
    expect(await nextRemind(id)).toBe('2026-10-30T03:30:00.000Z');
    await patch({ active: false });
    expect(await nextRemind(id)).toBeNull();
    await patch({ active: true });
    expect(await nextRemind(id)).toBe('2026-10-30T03:30:00.000Z');
    expect(await patch({ day_of_month: 5 })).toMatchObject({ next_due_date: '2026-11-05' });
    expect(await nextRemind(id)).toBe('2026-11-03T03:30:00.000Z');
    await patch({ name: 'Netflix HD' }); // unrelated edits leave it alone
    expect(await nextRemind(id)).toBe('2026-11-03T03:30:00.000Z');
    expect((await patch({ remind_lead_days: null })).remind_lead_days).toBeNull();
    expect(await nextRemind(id)).toBeNull();
  });

  it('after the poster moves the item on, the next period gets its own lead-day instant', async () => {
    setNow('2026-10-25T05:00:00Z');
    const { id } = await createItem();
    await sendDueReminders(makeEnv(), at('2026-10-31T03:31:00Z'), { pushSend: fakePush().send }); // sends l1 only (l3 collapsed)
    expect(await nextRemind(id)).toBeNull();

    setNow('2026-11-01T01:00:00Z'); // the posted transaction (06:00 IST) must not be in the future
    const posted = await postDueRecurring(makeEnv(), at('2026-11-01T01:00:00Z')); // 06:30 IST on the 1st
    expect(posted).toEqual({ due: 1, posted: 1 });
    expect(await oneRow('recurring_items', 'id = ?', id)).toMatchObject({ next_due_date: '2026-12-01', next_remind_at: '2026-11-28T03:30:00.000Z' });

    // And that instant sends for the new due date.
    await sendDueReminders(makeEnv(), at('2026-11-28T04:00:00Z'), { pushSend: fakePush().send });
    expect((await notifications()).pop()).toMatchObject({ title: 'Netflix due in 3 days', dedupe_key: `reminder:rec:${id}:2026-12-01:l3` });
  });

  it('an item without lead days is untouched by the poster and the cron; a paused one is skipped', async () => {
    setNow('2026-10-25T05:00:00Z');
    const plain = await createItem(item({ name: 'Plain', remind_lead_days: undefined }));
    const paused = await createItem(item({ name: 'Paused' }));
    const patch = await call(`/api/v1/recurring/${paused.id}`, { method: 'PATCH', json: { active: false }, env: makeEnv({ WRITE_LIMITER: undefined }) });
    expect(patch.status).toBe(200);
    expect(await nextRemind(paused.id)).toBeNull();

    setNow('2026-11-01T01:00:00Z');
    await postDueRecurring(makeEnv(), at('2026-11-01T01:00:00Z'));
    expect(await nextRemind(plain.id)).toBeNull();
    const run = await sendDueReminders(makeEnv(), at('2026-11-30T00:00:00Z'), { pushSend: fakePush().send });
    expect(run.recurring.due).toBe(0);

    // Resuming plans from now again.
    setNow('2026-11-10T05:00:00Z');
    await call(`/api/v1/recurring/${paused.id}`, { method: 'PATCH', json: { active: true }, env: makeEnv({ WRITE_LIMITER: undefined }) });
    expect(await nextRemind(paused.id)).toBe('2026-11-28T03:30:00.000Z');
  });
});
