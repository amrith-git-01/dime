import { describe, expect, it } from 'vitest';

import { createServiceClient } from '../src/core/supabase';
import { monthInsightsData, yearInsights } from '../src/features/insights/service';
import { USER_ID, makeEnv } from './helpers';
import { json, pgError, rows, useSupabaseStub } from './supabase-stub';

const stub = useSupabaseStub();
const scope = () => ({ db: createServiceClient(makeEnv()), userId: USER_ID });

const day = (d: string, credit: number, debit: number) => ({ day: d, credit_total: credit, debit_total: debit, credit_count: credit ? 1 : 0, debit_count: debit ? 1 : 0 });

describe('yearInsights (port of InsightsService.year_insights)', () => {
  it('buckets daily totals into monthly cashflow up to the window end and rolls up payees', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_daily_totals', () =>
      json([day('2026-01-05', 1000, 200), day('2026-01-20', 0, 300), day('2026-03-02', 500, 0), day('2026-06-13', 0, 50)]),
    );
    stub.on('POST', '/rest/v1/rpc/transactions_payee_totals', () =>
      json([
        { type: 'debit', payee_key: 'a', display_name: 'A', total: 300, transaction_count: 2 },
        { type: 'debit', payee_key: 'b', display_name: 'B', total: 150, transaction_count: 2 },
        { type: 'debit', payee_key: 'c', display_name: 'C', total: 50, transaction_count: 1 },
        { type: 'credit', payee_key: 'boss', display_name: 'Boss', total: 1500, transaction_count: 2 },
      ]),
    );

    const out = await yearInsights(scope(), {
      fromIso: '2026-01-01T00:00:00+05:30',
      toIso: '2026-06-13T23:59:59.999999+05:30',
      timezone: 'Asia/Kolkata',
    });

    expect(out.year).toBe(2026);
    expect(out.is_ytd).toBe(true);
    expect(out.summary).toEqual({ credit_total: '1500.00', debit_total: '550.00', net: '950.00', transaction_count: 5 });
    expect(out.monthly_cashflow).toHaveLength(6);
    expect(out.monthly_cashflow[0]).toEqual({ month: 1, date: '2026-01-01', debit_total: '500.00', credit_total: '1000.00' });
    expect(out.monthly_cashflow[1]).toEqual({ month: 2, date: '2026-02-01', debit_total: '0', credit_total: '0' });
    expect(out.monthly_cashflow[5]).toEqual({ month: 6, date: '2026-06-01', debit_total: '50.00', credit_total: '0' });
    expect(out.top_payees.map((p) => [p.payee_key, p.debit_total, p.share])).toEqual([
      ['a', '300.00', 0.5455],
      ['b', '150.00', 0.2727],
      ['c', '50.00', 0.0909],
    ]);

    // One half-open window covering the whole range in the user's timezone: Jan 1 00:00 IST .. Jun 14 00:00 IST.
    const window = { p_user_id: USER_ID, p_from: '2025-12-31T18:30:00.000Z', p_to: '2026-06-13T18:30:00.000Z' };
    expect(stub.last('POST', '/rpc/transactions_daily_totals').body).toEqual({ ...window, p_tz: 'Asia/Kolkata' });
    expect(stub.last('POST', '/rpc/transactions_payee_totals').body).toEqual(window);
  });

  it('a full calendar year is not YTD and always has 12 months', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_daily_totals', () => json([]));
    stub.on('POST', '/rest/v1/rpc/transactions_payee_totals', () => json([]));
    const out = await yearInsights(scope(), {
      fromIso: '2025-01-01T00:00:00+05:30',
      toIso: '2025-12-31T23:59:59.999999+05:30',
      timezone: 'Asia/Kolkata',
    });
    expect(out.is_ytd).toBe(false);
    expect(out.monthly_cashflow).toHaveLength(12);
    expect(out.summary).toEqual({ credit_total: '0.00', debit_total: '0.00', net: '0.00', transaction_count: 0 });
    expect(out.top_payees).toEqual([]);
  });

  it('falls back to row paging before the aggregate migration is applied', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_daily_totals', () => pgError('PGRST202', 'missing', 404));
    stub.on('POST', '/rest/v1/rpc/transactions_payee_totals', () => pgError('PGRST202', 'missing', 404));
    stub.on('GET', '/rest/v1/transactions', (call) => {
      const select = call.params.get('select') ?? '';
      return select.startsWith('amount,type,transaction_at')
        ? rows([{ amount: 100, type: 'debit', transaction_at: '2026-02-10T10:00:00+00:00' }])
        : rows([{ amount: 100, type: 'debit', counterparty_name: 'Metro', counterparty_normalized: 'metro', transaction_at: '2026-02-10T10:00:00+00:00' }]);
    });
    const out = await yearInsights(scope(), { fromIso: '2026-01-01T00:00:00+05:30', toIso: '2026-03-31T23:59:59.999999+05:30', timezone: 'Asia/Kolkata' });
    expect(out.monthly_cashflow.map((m) => m.debit_total)).toEqual(['0', '100.00', '0']);
    expect(out.top_payees).toMatchObject([{ payee_key: 'metro', debit_total: '100.00', share: 1 }]);
  });
});

describe('monthInsightsData', () => {
  it('skips the top-expenses query when asked (the agent compare path does not need it)', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_daily_totals', () => json([day('2026-05-15', 0, 10)]));
    stub.on('POST', '/rest/v1/rpc/transactions_payee_totals', () => json([]));
    const out = await monthInsightsData(scope(), { year: 2026, month: 5, timezone: 'Asia/Kolkata' }, { top: false });
    expect(out.top_rows).toEqual([]);
    expect(out.summary.debit_total).toBe('10.00');
    expect(stub.find('GET', '/rest/v1/transactions')).toHaveLength(0);
  });
});
