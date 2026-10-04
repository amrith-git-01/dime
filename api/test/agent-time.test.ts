import { describe, expect, it } from 'vitest';

import { dayBoundsIso, lastNDaysBoundsIso, monthBoundsIso, previousMonthBoundsIso, wallIso } from '../src/features/agent/dates';
import { prependTemporalContext, temporalContextSection } from '../src/features/agent/temporal-context';
import {
  MAX_DAILY_COMPARISON_DAYS,
  buildCompareTimeRange,
  buildDailyRangeClarification,
  fillCashflowPoints,
  isDailyComparisonText,
  resolveDailyComparisonRange,
  resolveTimeRange,
  spansMultipleCalendarMonths,
} from '../src/features/agent/time-range';
import type { PackedRange } from '../src/features/agent/time-range';

/** Instants and expectations below come from running the Python implementation (`backend/features/agent`). */
const at = (iso: string) => Date.parse(iso);
const JUN13 = at('2026-06-13T15:00:00+05:30');

describe('offset ISO helpers (Python datetime.isoformat)', () => {
  it('formats IST, UTC and DST-observing zones', () => {
    expect(monthBoundsIso('Asia/Kolkata', 2026, 6)).toEqual(['2026-06-01T00:00:00+05:30', '2026-06-30T23:59:59.999999+05:30']);
    expect(dayBoundsIso('UTC', { year: 2026, month: 6, day: 13 })).toEqual(['2026-06-13T00:00:00+00:00', '2026-06-13T23:59:59.999999+00:00']);
    expect(dayBoundsIso('America/New_York', { year: 2026, month: 6, day: 13 })[0]).toBe('2026-06-13T00:00:00-04:00');
    expect(dayBoundsIso('America/New_York', { year: 2026, month: 1, day: 13 })[0]).toBe('2026-01-13T00:00:00-05:00');
    expect(wallIso('Asia/Kolkata', { year: 2026, month: 6, day: 13 }, 9, 5, 7)).toBe('2026-06-13T09:05:07+05:30');
  });

  it('handles month and year boundaries', () => {
    expect(previousMonthBoundsIso('Asia/Kolkata', { year: 2026, month: 1, day: 15 })).toEqual([
      '2025-12-01T00:00:00+05:30',
      '2025-12-31T23:59:59.999999+05:30',
    ]);
    expect(lastNDaysBoundsIso('Asia/Kolkata', { year: 2026, month: 3, day: 2 }, 5)).toEqual([
      '2026-02-26T00:00:00+05:30',
      '2026-03-02T23:59:59.999999+05:30',
    ]);
    expect(monthBoundsIso('UTC', 2028, 2)[1]).toBe('2028-02-29T23:59:59.999999+00:00');
  });
});

describe('resolveTimeRange', () => {
  it('matches the Python output exactly (last 30 days, IST)', () => {
    expect(resolveTimeRange('last 30 days', 'Asia/Kolkata', JUN13)).toEqual({
      kind: 'last_n_days',
      n: 30,
      start_date: '2026-05-15',
      end_date: '2026-06-13',
      day_count: 30,
      start_iso: '2026-05-15T00:00:00+05:30',
      end_iso: '2026-06-13T23:59:59.999999+05:30',
      label: '15 May – 13 Jun 2026 (30 days)',
    });
  });

  it('last week is seven days (UTC)', () => {
    expect(resolveTimeRange('spending last week', 'UTC', JUN13)).toEqual({
      kind: 'last_n_days',
      n: 7,
      start_date: '2026-06-07',
      end_date: '2026-06-13',
      day_count: 7,
      start_iso: '2026-06-07T00:00:00+00:00',
      end_iso: '2026-06-13T23:59:59.999999+00:00',
      label: '7–13 Jun 2026 (7 days)',
    });
  });

  it('yesterday and today (label keeps the Python "12–12 ... (1 days)" shape)', () => {
    expect(resolveTimeRange('yesterday', 'Asia/Kolkata', JUN13)).toMatchObject({
      kind: 'yesterday',
      n: null,
      start_date: '2026-06-12',
      day_count: 1,
      label: '12–12 Jun 2026 (1 days)',
    });
    expect(resolveTimeRange('today', 'America/New_York', JUN13)).toMatchObject({
      kind: 'today',
      start_iso: '2026-06-13T00:00:00-04:00',
      end_iso: '2026-06-13T23:59:59.999999-04:00',
    });
  });

  it('this month, last month, this year and the monthly-budget phrase', () => {
    expect(resolveTimeRange('this month', 'Asia/Kolkata', JUN13)).toMatchObject({
      kind: 'current_month',
      start_date: '2026-06-01',
      end_date: '2026-06-30',
      day_count: 30,
      label: '1–30 Jun 2026 (30 days)',
    });
    expect(resolveTimeRange('What about last month?', 'Asia/Kolkata', JUN13)).toMatchObject({
      kind: 'previous_month',
      start_date: '2026-05-01',
      end_date: '2026-05-31',
      label: '1–31 May 2026 (31 days)',
    });
    expect(resolveTimeRange('List my uber transactions in this year', 'Asia/Kolkata', JUN13)).toMatchObject({
      kind: 'calendar_year',
      start_date: '2026-01-01',
      end_date: '2026-06-13',
      day_count: 164,
      label: '01 Jan – 13 Jun 2026 (164 days)',
    });
    expect(resolveTimeRange('Am I over my monthly budget?', 'Asia/Kolkata', JUN13)).toMatchObject({
      kind: 'current_month',
      start_date: '2026-06-01',
      end_date: '2026-06-30',
    });
  });

  it('returns null without a phrase, on blank text and for "last 0 days"', () => {
    expect(resolveTimeRange('How much on groceries?', 'Asia/Kolkata', JUN13)).toBeNull();
    expect(resolveTimeRange('   ', 'Asia/Kolkata', JUN13)).toBeNull();
    expect(resolveTimeRange('last 0 days', 'Asia/Kolkata', JUN13)).toBeNull();
  });

  it('a missing timezone is UTC and an unknown one is a 400', () => {
    expect(resolveTimeRange('today', null, JUN13)?.start_iso).toBe('2026-06-13T00:00:00+00:00');
    expect(() => resolveTimeRange('today', 'Mars/Base', JUN13)).toThrow(/Invalid timezone/);
  });

  it('local day depends on the zone at that instant', () => {
    const lateUtc = at('2026-06-12T22:00:00Z'); // already 13 Jun 03:30 in IST
    expect(resolveTimeRange('today', 'Asia/Kolkata', lateUtc)?.start_date).toBe('2026-06-13');
    expect(resolveTimeRange('today', 'UTC', lateUtc)?.start_date).toBe('2026-06-12');
  });
});

describe('daily comparison ranges', () => {
  const fixed = at('2026-06-13T12:00:00+05:30');

  it('asks for a shorter window beyond the cap', () => {
    const resolved = resolveTimeRange('daily spending for the last 60 days', 'Asia/Kolkata', fixed);
    expect(resolved?.n).toBe(60);
    const { timeRange, clarification } = resolveDailyComparisonRange({
      userText: 'Show my daily spending for the last 60 days',
      goal: 'Daily spending for the last 60 days',
      timeRange: resolved,
      timezone: 'Asia/Kolkata',
      nowMs: fixed,
    });
    expect(timeRange?.day_count).toBe(60);
    expect(clarification).toContain(`${MAX_DAILY_COMPARISON_DAYS} days`);
    expect(clarification).toContain('60 days');
  });

  it('does not clamp an aggregate over a long range', () => {
    const resolved = resolveTimeRange('How much did I spend in the last 60 days?', 'Asia/Kolkata', fixed);
    const out = resolveDailyComparisonRange({
      userText: 'How much did I spend in the last 60 days?',
      goal: 'Total spending for the last 60 days',
      timeRange: resolved,
      timezone: 'Asia/Kolkata',
      nowMs: fixed,
    });
    expect(out.timeRange?.day_count).toBe(60);
    expect(out.clarification).toBeNull();
  });

  it('defaults a per-day request without a range to the cap and tags it', () => {
    const out = resolveDailyComparisonRange({ userText: 'Show my daily spending', goal: 'x', timeRange: null, timezone: 'UTC', nowMs: fixed });
    expect(out.timeRange?.day_count).toBe(MAX_DAILY_COMPARISON_DAYS);
    expect(out.timeRange?.daily_comparison).toBe(true);
    expect(out.clarification).toBeNull();
  });

  it('tags a short range for per-day charts', () => {
    const resolved = resolveTimeRange('daily spending last week', 'UTC', fixed);
    const out = resolveDailyComparisonRange({ userText: 'daily spending last week', goal: '', timeRange: resolved, timezone: 'UTC', nowMs: fixed });
    expect(out.timeRange?.daily_comparison).toBe(true);
  });

  it('mentions the requested window in the clarification', () => {
    const message = buildDailyRangeClarification({ label: '14 Apr – 13 Jun 2026 (61 days)', day_count: 61 });
    expect(message).toContain(`${MAX_DAILY_COMPARISON_DAYS} days`);
    expect(message).toContain('61 days');
    expect(message).toContain(`last ${MAX_DAILY_COMPARISON_DAYS} days`);
  });

  it('detects daily keywords', () => {
    expect(isDailyComparisonText('Show daily spending')).toBe(true);
    expect(isDailyComparisonText('what was my busiest day')).toBe(true);
    expect(isDailyComparisonText('Top 5 payees')).toBe(false);
  });
});

describe('fillCashflowPoints', () => {
  it('inserts zero days and ignores non-numeric amounts', () => {
    const filled = fillCashflowPoints(
      [
        { date: '2026-06-01', amount: 100 },
        { date: '2026-06-03T10:00:00', amount: 50 },
        { date: '2026-06-02', amount: 'x' },
      ],
      '2026-06-01',
      '2026-06-03',
    );
    expect(filled).toEqual([
      { date: '2026-06-01', amount: 100 },
      { date: '2026-06-02', amount: 0 },
      { date: '2026-06-03', amount: 50 },
    ]);
  });
});

describe('spansMultipleCalendarMonths', () => {
  it('is true for years and multi-month windows only', () => {
    const range = (over: Partial<PackedRange>) => ({ kind: 'last_n_days', start_date: '2026-06-01', end_date: '2026-06-30', ...over }) as PackedRange;
    expect(spansMultipleCalendarMonths(null)).toBe(false);
    expect(spansMultipleCalendarMonths(range({}))).toBe(false);
    expect(spansMultipleCalendarMonths(range({ end_date: '2026-07-01' }))).toBe(true);
    expect(spansMultipleCalendarMonths(range({ kind: 'calendar_year' }))).toBe(true);
  });
});

describe('buildCompareTimeRange', () => {
  const today = { year: 2026, month: 6, day: 13 };

  it('month pair (Python output)', () => {
    expect(buildCompareTimeRange('month_pair', { year: 2026, month: 6 }, { year: 2026, month: 5 }, { tz: 'Asia/Kolkata', today })).toEqual({
      kind: 'compare',
      subkind: 'month_pair',
      period_a: { start_iso: '2026-06-01T00:00:00+05:30', end_iso: '2026-06-30T23:59:59.999999+05:30', label: 'Jun 2026' },
      period_b: { start_iso: '2026-05-01T00:00:00+05:30', end_iso: '2026-05-31T23:59:59.999999+05:30', label: 'May 2026' },
      label: 'Jun 2026 vs May 2026',
    });
  });

  it('year pair: YTD vs full year (Python output)', () => {
    expect(buildCompareTimeRange('year_pair', { year: 2026, ytd: true }, { year: 2025, ytd: false }, { tz: 'Asia/Kolkata', today })).toEqual({
      kind: 'compare',
      subkind: 'year_pair',
      period_a: { start_iso: '2026-01-01T00:00:00+05:30', end_iso: '2026-06-13T23:59:59.999999+05:30', label: '2026 (YTD)' },
      period_b: { start_iso: '2025-01-01T00:00:00+05:30', end_iso: '2025-12-31T23:59:59.999999+05:30', label: '2025' },
      label: '2026 (YTD) vs 2025',
    });
  });

  it('throws on unusable periods (the caller falls back to SQL routing)', () => {
    const opts = { tz: 'UTC', today };
    expect(() => buildCompareTimeRange('month_pair', { year: 2026, month: null }, { year: 2026, month: 5 }, opts)).toThrow();
    expect(() => buildCompareTimeRange('month_pair', { year: 2026, month: 13 }, { year: 2026, month: 5 }, opts)).toThrow();
    expect(() => buildCompareTimeRange('month_pair', { year: 0, month: 1 }, { year: 2026, month: 5 }, opts)).toThrow();
  });
});

describe('temporal context', () => {
  it('matches the Python NOW block exactly', () => {
    expect(temporalContextSection('Asia/Kolkata', JUN13)).toBe(
      '## NOW (authoritative — do not guess dates)\nToday: 2026-06-13 (Saturday)\nTimezone: Asia/Kolkata\nToday: 2026-06-13 → 2026-06-13\n' +
        'Current month (this month): 2026-06-01 → 2026-06-30\nPrevious month: 2026-05-01 → 2026-05-31\nLast 7 days: 2026-06-07 → 2026-06-13\n' +
        'Last 30 days: 2026-05-15 → 2026-06-13\n\nMap relative terms to the ranges above (e.g. "previous month" = Previous month).\n' +
        'Never infer dates from model training knowledge.\n',
    );
  });

  it('previous month across a year boundary, UTC default, and prepending', () => {
    const jan = temporalContextSection('Asia/Kolkata', at('2026-01-15T09:00:00+05:30'));
    expect(jan).toContain('Previous month: 2025-12-01 → 2025-12-31');
    expect(temporalContextSection(null, at('2026-06-12T00:00:00Z'))).toContain('Timezone: UTC');
    const combined = prependTemporalContext('SYSTEM BODY', 'UTC', at('2026-06-12T00:00:00Z'));
    expect(combined.startsWith('## NOW')).toBe(true);
    expect(combined.endsWith('SYSTEM BODY')).toBe(true);
  });
});
