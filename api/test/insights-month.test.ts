import { describe, expect, it } from 'vitest';

import { monthInsightsData } from '../src/features/insights/service';
import { USER_ID } from './helpers';
import { seedTransaction, testDb } from './db';

const scope = () => ({ db: testDb(), userId: USER_ID });

/** One row per (day, side) at noon IST, so each lands on the intended local day. */
const tx = (day: string, amount: string, type: 'debit' | 'credit', name: string, normalized?: string | null) =>
  seedTransaction({
    amount,
    type,
    counterparty_name: name,
    ...(normalized === undefined ? {} : { counterparty_normalized: normalized }),
    transaction_at: new Date(Date.parse(`${day}T12:00:00+05:30`)).toISOString(),
  });

describe('monthInsightsData', () => {
  it('skips the top-expenses query when asked (the agent compare path does not need it)', async () => {
    await tx('2026-05-15', '10', 'debit', 'Shop');
    const out = await monthInsightsData(scope(), { year: 2026, month: 5, timezone: 'Asia/Kolkata' }, { top: false });
    expect(out.top_rows).toEqual([]);
    expect(out.summary.debit_total).toBe('10.00');
    const withTop = await monthInsightsData(scope(), { year: 2026, month: 5, timezone: 'Asia/Kolkata' });
    expect(withTop.top_rows).toHaveLength(1);
  });
});
