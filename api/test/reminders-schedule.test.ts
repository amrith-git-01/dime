import { describe, expect, it } from 'vitest';

import {
  advanceDue,
  daysBetween,
  dueNow,
  fireSteps,
  isCalendarDate,
  leadCap,
  localInstantMs,
  minutesOf,
  nextFireMs,
  parseLeadDays,
  rollAtMs,
} from '../src/features/reminders/schedule';
import type { ReminderCadence, ScheduleInput } from '../src/features/reminders/schedule';

const IST = 'Asia/Kolkata';
/** 09:00 IST is 03:30 UTC. */
const utc = (iso: string) => Date.parse(iso);
const isoOf = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

const base: ScheduleInput = { dueDate: '2026-11-10', timezone: IST, time: '09:00', leadDays: [3, 1, 0], overdueNudges: 2, quiet: null };
const steps = (over: Partial<ScheduleInput> = {}) => fireSteps({ ...base, ...over }).map((s) => [s.key, isoOf(s.atMs)]);

describe('fireSteps', () => {
  it('lead days before the due date plus overdue nudges after it, at the reminder time, oldest first', () => {
    expect(steps()).toEqual([
      ['l3', '2026-11-07T03:30:00.000Z'],
      ['l1', '2026-11-09T03:30:00.000Z'],
      ['l0', '2026-11-10T03:30:00.000Z'],
      ['o1', '2026-11-11T03:30:00.000Z'],
      ['o2', '2026-11-12T03:30:00.000Z'],
    ]);
  });

  it('sorts whatever order the lead days are given in; no nudges, no leads', () => {
    expect(steps({ leadDays: [0, 3], overdueNudges: 0 }).map(([k]) => k)).toEqual(['l3', 'l0']);
    expect(steps({ leadDays: [], overdueNudges: 1 }).map(([k]) => k)).toEqual(['o1']);
    expect(steps({ leadDays: [], overdueNudges: 0 })).toEqual([]);
  });

  it('crosses month and year ends', () => {
    expect(steps({ dueDate: '2027-01-02', leadDays: [3], overdueNudges: 0 })).toEqual([['l3', '2026-12-30T03:30:00.000Z']]);
  });

  it('uses the reminder timezone, DST included', () => {
    // New York leaves daylight time on 1 Nov 2026: 09:00 is UTC-4 before it and UTC-5 after it.
    expect(steps({ timezone: 'America/New_York', dueDate: '2026-11-03', leadDays: [3, 0], overdueNudges: 0 })).toEqual([
      ['l3', '2026-10-31T13:00:00.000Z'],
      ['l0', '2026-11-03T14:00:00.000Z'],
    ]);
  });

  describe('quiet hours', () => {
    const quiet = { start: '22:00', end: '08:00' };
    const one = (time: string, q = quiet) => isoOf(fireSteps({ ...base, leadDays: [0], overdueNudges: 0, time, quiet: q })[0]?.atMs ?? null);

    it('an instant inside a window that crosses midnight moves to the window end: the same morning for the early half', () => {
      expect(one('03:00')).toBe('2026-11-10T02:30:00.000Z'); // 08:00 IST on the 10th
      // The evening half would move to the next morning: a lead step on the due day cannot go past it (see below).
      const day = (lead: number, time: string) => isoOf(fireSteps({ ...base, leadDays: [lead], overdueNudges: 0, time, quiet })[0]?.atMs ?? null);
      expect(day(1, '23:00')).toBe('2026-11-10T02:30:00.000Z'); // the day before the due date: 08:00 IST on the due date itself is fine
      expect(day(1, '22:00')).toBe('2026-11-10T02:30:00.000Z'); // the start is inside the window
    });

    it('a lead step quiet hours would push past the due date is sent just before the window starts instead', () => {
      expect(one('23:00')).toBe('2026-11-10T16:29:00.000Z'); // 21:59 IST on the due date, not 08:00 the next day
      expect(one('22:00')).toBe('2026-11-10T16:29:00.000Z');
      expect(one('22:30', { start: '22:15', end: '06:00' })).toBe('2026-11-10T16:44:00.000Z'); // 22:14 IST: the minute before THIS window starts
    });

    it('overdue nudges may move on to a later morning', () => {
      const nudge = fireSteps({ ...base, leadDays: [], overdueNudges: 1, time: '23:00', quiet });
      expect(nudge.map((n) => [n.key, isoOf(n.atMs)])).toEqual([['o1', '2026-11-12T02:30:00.000Z']]); // 23:00 on the 11th -> 08:00 IST on the 12th
    });

    it('outside the window nothing moves; the end itself is outside', () => {
      expect(one('08:00')).toBe('2026-11-10T02:30:00.000Z');
      expect(one('09:00')).toBe('2026-11-10T03:30:00.000Z');
      expect(one('21:59')).toBe('2026-11-10T16:29:00.000Z');
    });

    it('a window inside one day, and start = end (no window)', () => {
      const lunch = { start: '13:00', end: '15:00' };
      expect(one('14:00', lunch)).toBe('2026-11-10T09:30:00.000Z'); // 15:00 IST
      expect(one('13:00', lunch)).toBe('2026-11-10T09:30:00.000Z');
      expect(one('15:00', lunch)).toBe('2026-11-10T09:30:00.000Z');
      expect(one('12:59', lunch)).toBe('2026-11-10T07:29:00.000Z');
      expect(one('23:00', { start: '22:00', end: '22:00' })).toBe('2026-11-10T17:30:00.000Z');
    });
  });
});

describe('nextFireMs', () => {
  it('the first instant strictly after the given one; null after the last (one-off)', () => {
    const at = (iso: string, repeating = false) => isoOf(nextFireMs(base, utc(iso), repeating));
    expect(at('2026-11-01T00:00:00Z')).toBe('2026-11-07T03:30:00.000Z');
    expect(at('2026-11-07T03:30:00Z')).toBe('2026-11-09T03:30:00.000Z'); // strictly after
    expect(at('2026-11-12T03:30:00Z')).toBeNull();
  });

  it('a repeating reminder has the roll after its last step', () => {
    // 13 Nov 00:00 IST, the start of the day after the last nudge.
    expect(isoOf(nextFireMs(base, utc('2026-11-12T03:30:00Z'), true))).toBe('2026-11-12T18:30:00.000Z');
    expect(isoOf(rollAtMs(base))).toBe('2026-11-12T18:30:00.000Z');
  });

  it('the roll never comes before a step that quiet hours pushed past midnight', () => {
    const input: ScheduleInput = { ...base, leadDays: [], overdueNudges: 1, time: '23:00', quiet: { start: '22:00', end: '08:00' } };
    expect(rollAtMs(input)).toBe(utc('2026-11-12T02:30:00Z') + 1); // the nudge moved to 08:00 on the 12th, after midnight of the 12th
  });

  it('steps at or after cutoffMs are dropped (recurring items: the poster moves the item on at 06:00 on the due date)', () => {
    const cutoffMs = utc('2026-11-09T03:30:00Z');
    expect(fireSteps({ ...base, cutoffMs }).map((s) => s.key)).toEqual(['l3']);
    expect(fireSteps({ ...base, cutoffMs: cutoffMs + 1 }).map((s) => s.key)).toEqual(['l3', 'l1']);
    expect(nextFireMs({ ...base, cutoffMs }, utc('2026-11-07T03:30:00Z'), false)).toBeNull();
  });
});

describe('dueNow (collapse to the latest)', () => {
  it('sends only the latest of several due steps', () => {
    const r = dueNow(base, -Infinity, utc('2026-11-10T05:00:00Z'), false);
    expect(r.step?.key).toBe('l0');
    expect(r.roll).toBe(false);
  });

  it('steps up to the last sent instant are not due again', () => {
    expect(dueNow(base, utc('2026-11-10T03:30:00Z'), utc('2026-11-10T05:00:00Z'), false).step).toBeNull();
    expect(dueNow(base, utc('2026-11-09T03:30:00Z'), utc('2026-11-12T05:00:00Z'), false).step?.key).toBe('o2');
  });

  it('nothing is due before the first step', () => {
    expect(dueNow(base, -Infinity, utc('2026-11-07T03:29:59Z'), false)).toEqual({ step: null, roll: false });
  });

  it('a repeating reminder rolls once the roll instant is reached, dropping a stale step', () => {
    const now = utc('2026-11-12T18:30:00Z');
    expect(dueNow(base, utc('2026-11-12T03:30:00Z'), now, true)).toEqual({ step: null, roll: true });
    expect(dueNow(base, -Infinity, now, true)).toEqual({ step: null, roll: true });
    expect(dueNow(base, utc('2026-11-12T03:30:00Z'), now, false)).toEqual({ step: null, roll: false });
  });
});

describe('advanceDue', () => {
  const d = (y: number, m: number, day: number) => ({ year: y, month: m, day });

  it('weekly adds 7 days', () => {
    expect(advanceDue('weekly', 30, d(2026, 10, 30), d(2026, 10, 30))).toEqual(d(2026, 11, 6));
  });

  it('monthly clamps a 31st to short months and returns to the 31st', () => {
    const seen: string[] = [];
    let due = d(2026, 1, 31);
    for (let i = 0; i < 4; i += 1) {
      due = advanceDue('monthly', 31, due, d(2026, 1, 1));
      seen.push(`${due.year}-${due.month}-${due.day}`);
    }
    expect(seen).toEqual(['2026-2-28', '2026-3-31', '2026-4-30', '2026-5-31']);
    expect(advanceDue('monthly', 29, d(2028, 1, 29), d(2028, 1, 1))).toEqual(d(2028, 2, 29)); // leap year
    expect(advanceDue('monthly', 15, d(2026, 12, 15), d(2026, 12, 1))).toEqual(d(2027, 1, 15));
  });

  it('yearly keeps the month and clamps Feb 29', () => {
    expect(advanceDue('yearly', 29, d(2028, 2, 29), d(2028, 1, 1))).toEqual(d(2029, 2, 28));
    expect(advanceDue('yearly', 29, d(2027, 2, 28), d(2027, 1, 1))).toEqual(d(2028, 2, 29));
    expect(advanceDue('yearly', 5, d(2026, 7, 5), d(2026, 7, 5))).toEqual(d(2027, 7, 5));
  });

  it('never backfills into the past: skips occurrences before today, keeps today', () => {
    expect(advanceDue('weekly', 1, d(2026, 1, 1), d(2026, 10, 31))).toEqual(d(2026, 11, 5));
    expect(advanceDue('monthly', 15, d(2026, 1, 15), d(2026, 10, 31))).toEqual(d(2026, 11, 15));
    expect(advanceDue('monthly', 31, d(2026, 8, 31), d(2026, 10, 31))).toEqual(d(2026, 10, 31)); // Sept 30 is behind, Oct 31 is today
    expect(advanceDue('yearly', 1, d(2020, 3, 1), d(2026, 10, 31))).toEqual(d(2027, 3, 1));
  });
});

describe('helpers', () => {
  it('localInstantMs: a skipped DST time lands just after the jump, a repeated one resolves to its first occurrence', () => {
    expect(isoOf(localInstantMs('America/New_York', { year: 2026, month: 3, day: 8 }, 150))).toBe('2026-03-08T07:30:00.000Z'); // 02:30 does not exist: 03:30 EDT
    expect(isoOf(localInstantMs('America/New_York', { year: 2026, month: 11, day: 1 }, 90))).toBe('2026-11-01T05:30:00.000Z'); // 01:30 EDT, not EST
    expect(isoOf(localInstantMs(IST, { year: 2026, month: 11, day: 10 }, 9 * 60))).toBe('2026-11-10T03:30:00.000Z');
  });

  it('parseLeadDays accepts up to 5 unique ints 0..30 (JSON text or array) and falls back otherwise', () => {
    expect(parseLeadDays('[3,1,0]', null)).toEqual([3, 1, 0]);
    expect(parseLeadDays([30], null)).toEqual([30]);
    expect(parseLeadDays('[]', null)).toEqual([]);
    for (const bad of ['{', '"x"', '{"a":1}', '[31]', '[-1]', '[1.5]', '[1,1]', '[0,1,2,3,4,5]', '["1"]', null, undefined, 7]) {
      expect(parseLeadDays(bad, 'fallback'), String(bad)).toBe('fallback');
    }
  });

  it('leadCap: a weekly reminder is reminded at most 6 days ahead, monthly and yearly 27, a one-off 30', () => {
    expect(['none', 'weekly', 'monthly', 'yearly'].map((c) => leadCap(c as ReminderCadence))).toEqual([30, 6, 27, 27]);
  });

  it('minutesOf and isCalendarDate', () => {
    expect(minutesOf('09:30')).toBe(570);
    expect(minutesOf('23:59')).toBe(1439);
    expect(minutesOf('25:00')).toBe(540); // malformed: 09:00
    expect(isCalendarDate('2028-02-29')).toBe(true);
    for (const bad of ['2027-02-29', '2026-13-01', '2026-02-30', '2026-1-1', 'x', '']) expect(isCalendarDate(bad), bad).toBe(false);
  });

  it('daysBetween counts calendar days in either direction', () => {
    expect(daysBetween({ year: 2026, month: 10, day: 31 }, { year: 2026, month: 11, day: 2 })).toBe(2);
    expect(daysBetween({ year: 2026, month: 11, day: 2 }, { year: 2026, month: 10, day: 31 })).toBe(-2);
    expect(daysBetween({ year: 2026, month: 11, day: 2 }, { year: 2026, month: 11, day: 2 })).toBe(0);
  });
});
