import { describe, expect, it } from 'vitest';

import { PermanentAiError, TransientAiError } from '../src/features/ai/errors';
import {
  budgetSpendGuard,
  formatTranscript,
  reflect,
  routeAfterClassify,
  runAgentTurn,
  shouldRetrySql,
  trimHistory,
} from '../src/features/agent/service';
import type { ChatRequest } from '../src/features/agent/schemas';
import { AgentDbUnavailableError } from '../src/features/agent/sql-executor';
import type { CompareRange, PackedRange } from '../src/features/agent/time-range';
import { JUN13, fakeLlm, fakeSqlClient, makeDeps, noCompare, respondOk } from './agent-fixtures';
import { USER_ID } from './helpers';
import { json, pgError, useSupabaseStub } from './supabase-stub';

const stub = useSupabaseStub();

const chat = (content: string, extra: Partial<ChatRequest> = {}): ChatRequest => ({ content, timezone: 'Asia/Kolkata', history: [], ...extra });
const MONTH_COMPARE = {
  comparison_kind: 'month_pair',
  period_a: { year: 2026, month: 6 },
  period_b: { year: 2026, month: 5 },
};
const YEAR_COMPARE = {
  comparison_kind: 'year_pair',
  period_a: { year: 2026, ytd: true },
  period_b: { year: 2025, ytd: false },
};

describe('routing helpers (port of test_graph_routing.py)', () => {
  it('retries on a hint, stops at the cap, answers without a hint', () => {
    expect(shouldRetrySql({ nextSqlHint: 'Fix SQL error: x', queryRounds: 2 }, 5)).toBe(true);
    expect(shouldRetrySql({ nextSqlHint: 'Fix SQL error: x', queryRounds: 5 }, 5)).toBe(false);
    expect(shouldRetrySql({ nextSqlHint: null, queryRounds: 1 }, 5)).toBe(false);
  });

  it('only month/year compare ranges skip SQL', () => {
    const compare = { kind: 'compare', subkind: 'year_pair' } as CompareRange;
    expect(routeAfterClassify(compare)).toBe('fetch_compare_data');
    expect(routeAfterClassify({ kind: 'today' } as PackedRange)).toBe('generate_sql');
    expect(routeAfterClassify(null)).toBe('generate_sql');
  });
});

describe('reflect and the budget guard (port of test_reflect_budget_guard.py)', () => {
  it('retries when the SQL omits transactions', () => {
    const guard = budgetSpendGuard({
      userText: 'Am I over my monthly budget?',
      sqlAttempts: [{ sql: 'SELECT monthly_budget FROM budgets' }],
      lastResult: { rows: [{ monthly_budget: 25000 }] },
    });
    expect(guard).toContain('transactions');
  });

  it('passes when a spent column is present', () => {
    expect(
      budgetSpendGuard({
        userText: 'Am I over my monthly budget?',
        sqlAttempts: [{ sql: 'SELECT b.monthly_budget, COALESCE(SUM(t.amount),0) AS spent FROM budgets b LEFT JOIN transactions t ON ...' }],
        lastResult: { rows: [{ monthly_budget: 25000, spent: 18388 }] },
      }),
    ).toBeNull();
  });

  it('retries on no rows or no spend key, ignores non-budget questions and SQL errors', () => {
    const base = { userText: 'budget status', sqlAttempts: [{ sql: 'select * from transactions' }] };
    expect(budgetSpendGuard({ ...base, lastResult: { rows: [] } })).toContain('monthly_budget');
    expect(budgetSpendGuard({ ...base, lastResult: { rows: [{ monthly_budget: 1 }] } })).toContain('monthly_budget');
    expect(budgetSpendGuard({ ...base, lastResult: { rows: [], error: 'boom' } })).toBeNull();
    expect(budgetSpendGuard({ ...base, userText: 'top payees', lastResult: { rows: [] } })).toBeNull();
  });

  it('reflect prefers the SQL error hint', () => {
    expect(reflect({ userText: 'x', lastResult: { error: 'column "z" does not exist' }, sqlAttempts: [] })).toBe(
      'Fix SQL error: column "z" does not exist',
    );
    expect(reflect({ userText: 'x', lastResult: { rows: [1], error: null }, sqlAttempts: [] })).toBeNull();
    expect(reflect({ userText: 'x', lastResult: null, sqlAttempts: [] })).toBeNull();
  });
});

describe('history helpers', () => {
  it('keeps the most recent turns', () => {
    const history = Array.from({ length: 5 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }));
    expect(trimHistory(history, 3).map((m) => m.content)).toEqual(['m2', 'm3', 'm4']);
    expect(trimHistory(history, 10)).toHaveLength(5);
  });

  it('formats a transcript with the current question last', () => {
    expect(formatTranscript([{ role: 'user', content: ' Hi ' }, { role: 'assistant', content: 'Hello!' }], 'Food spend?')).toBe(
      'User: Hi\nAssistant: Hello!\nUser: Food spend?',
    );
  });
});

describe('runAgentTurn: SQL route', () => {
  it('classify -> generate -> execute -> respond, with chart, deep link and one DB transaction', async () => {
    const llm = fakeLlm({
      classify: [noCompare],
      sql: [{ sql: "SELECT counterparty_normalized, counterparty_name, SUM(amount) AS total_spending FROM transactions WHERE type = 'debit' GROUP BY 1, 2" }],
      respond: [
        respondOk('You had **12 Swiggy orders** totalling **₹4,820**.', {
          chart: { chart_kind: 'donut', title: 'Top payees', series: [{ name: 'Swiggy', value: 4820 }, { name: 'Zomato', value: 900 }] },
          deep_link: { filter: 'payee', label: 'View Swiggy', year: 2026, monthIndex0: 5, payeeId: 'WRONG', payeeDisplayName: 'Swiggy' },
        }),
      ],
    });
    const sql = fakeSqlClient({ onSelect: () => [{ counterparty_normalized: 'swiggy', counterparty_name: 'Swiggy', total_spending: 4820 }] });

    const response = await runAgentTurn(makeDeps(llm, {}, sql.client), USER_ID, chat('how much on swiggy this month?'));

    expect(response.answer).toBe('You had **12 Swiggy orders** totalling **₹4,820**.');
    expect(response.blocks).toEqual([
      { type: 'mini_chart', chart_kind: 'donut', payload: { title: 'Top payees', series: [{ name: 'Swiggy', value: 4820 }, { name: 'Zomato', value: 900 }] } },
    ]);
    // The deep link is bound to the exact id from the SQL rows, never the model's.
    expect(response.deep_link).toMatchObject({ screen: 'TransactionsList', params: { filter: 'payee', payeeId: 'swiggy', payeeDisplayName: 'Swiggy' } });

    expect(llm.calls.map((c) => c.node)).toEqual(['classify', 'sql', 'respond']);
    expect(sql.selects).toHaveLength(1);
    // Prompts: NOW block first, resolved time_range for "this month", and the schema.
    const gen = llm.of('sql')[0];
    expect(gen?.system.startsWith('## NOW (authoritative')).toBe(true);
    expect(gen?.system).toContain('# Dime finance schema');
    expect(gen?.user).toContain('time_range (use these bounds exactly):');
    expect(gen?.user).toContain('"start_date":"2026-06-01"');
    const respondPrompt = JSON.parse(llm.of('respond')[0]?.user ?? '{}') as Record<string, unknown>;
    expect(respondPrompt).toMatchObject({ user_question: 'how much on swiggy this month?', error: null });
    expect(respondPrompt['last_result']).toMatchObject({ row_count: 1, truncated: false, error: null });
    expect(respondPrompt['sql_attempts']).toMatchObject([{ round: 1, row_count: 1, error: null }]);
  });

  it('retries after a SQL error with the hint, then answers', async () => {
    const llm = fakeLlm({
      classify: [noCompare],
      sql: [{ sql: 'SELECT nope FROM transactions' }, { sql: 'SELECT SUM(amount) AS total FROM transactions' }],
      respond: [respondOk('You spent ₹100.')],
    });
    const sql = fakeSqlClient({
      onSelect: (_q, n) => (n === 1 ? Object.assign(new Error('column "nope" does not exist'), { name: 'PostgresError' }) : [{ total: 100 }]),
    });
    const response = await runAgentTurn(makeDeps(llm, {}, sql.client), USER_ID, chat('what is my total'));

    expect(response.answer).toBe('You spent ₹100.');
    expect(llm.of('sql')).toHaveLength(2);
    expect(llm.of('sql')[0]?.user).not.toContain('Fix hint');
    expect(llm.of('sql')[1]?.user).toContain('Fix hint from previous attempt: Fix SQL error: PostgresError: column "nope" does not exist');
    const attempts = (JSON.parse(llm.of('respond')[0]?.user ?? '{}') as { sql_attempts: { round: number; error: string | null }[] }).sql_attempts;
    expect(attempts.map((a) => a.round)).toEqual([1, 2]);
    expect(attempts[0]?.error).toContain('column "nope" does not exist');
    expect(attempts[1]?.error).toBeNull();
  });

  it('stops at AGENT_MAX_TOOL_ROUNDS and still responds', async () => {
    const llm = fakeLlm({ classify: [noCompare], sql: [{ sql: 'SELECT nope FROM transactions' }], respond: [respondOk('I could not get that data.')] });
    const sql = fakeSqlClient({ onSelect: () => new Error('still broken') });
    const response = await runAgentTurn(makeDeps(llm, {}, sql.client), USER_ID, chat('show me stuff'));

    expect(response.answer).toBe('I could not get that data.');
    expect(llm.of('sql')).toHaveLength(3); // maxToolRounds = 3 in these tests
    expect(sql.selects).toHaveLength(3);
    expect(llm.of('respond')).toHaveLength(1);
  });

  it('a SQL the validator rejects costs a round but never reaches the database', async () => {
    const llm = fakeLlm({
      classify: [noCompare],
      sql: [{ sql: 'SELECT * FROM pg_roles' }, { sql: 'SELECT COUNT(*) AS n FROM transactions' }],
      respond: [respondOk('You have 3 transactions.')],
    });
    const sql = fakeSqlClient({ onSelect: () => [{ n: 3 }] });
    await runAgentTurn(makeDeps(llm, {}, sql.client), USER_ID, chat('how many transactions'));
    expect(sql.selects).toHaveLength(1);
    expect(llm.of('sql')[1]?.user).toContain('Fix SQL error: Disallowed tables: pg_roles');
  });

  it('budget guard: a budget answer without spend triggers one more round with guidance', async () => {
    const llm = fakeLlm({
      classify: [noCompare],
      sql: [{ sql: 'SELECT monthly_budget FROM budgets' }, { sql: 'SELECT b.monthly_budget, COALESCE(SUM(t.amount), 0) AS spent FROM budgets b LEFT JOIN transactions t ON true GROUP BY 1' }],
      respond: [respondOk('You have used **74%** of your budget.')],
    });
    const sql = fakeSqlClient({ onSelect: (_q, n) => (n === 1 ? [{ monthly_budget: 25000 }] : [{ monthly_budget: 25000, spent: 18388 }]) });
    const response = await runAgentTurn(makeDeps(llm, {}, sql.client), USER_ID, chat('Am I over my monthly budget?'));

    expect(response.answer).toContain('74%');
    expect(llm.of('sql')).toHaveLength(2);
    expect(llm.of('sql')[1]?.user).toContain('Join budgets with SUM(debit transactions)');
    // "monthly budget" resolves the current month deterministically.
    expect(llm.of('sql')[0]?.user).toContain('"kind":"current_month"');
  });

  it('gap-fills cashflow charts over the authoritative range and tags per-day requests', async () => {
    const llm = fakeLlm({
      classify: [noCompare],
      sql: [{ sql: 'SELECT transaction_at::date AS d, SUM(amount) AS amount FROM transactions GROUP BY 1' }],
      respond: [respondOk('Busiest day was 8 June.', { chart: { chart_kind: 'cashflow', title: 'Daily', points: [{ date: '2026-06-08', amount: 900 }] } })],
    });
    const sql = fakeSqlClient({ onSelect: () => [{ d: '2026-06-08', amount: 900 }] });
    const response = await runAgentTurn(makeDeps(llm, {}, sql.client), USER_ID, chat('daily spending for the last 5 days'));

    expect(llm.of('sql')[0]?.user).toContain('Per-day breakdown requested — max 40 days.');
    const block = response.blocks[0] as { chart_kind: string; payload: { points: { date: string; amount: number }[]; start_date: string; end_date: string } };
    expect(block.chart_kind).toBe('cashflow');
    expect(block.payload.start_date).toBe('2026-06-09');
    expect(block.payload.end_date).toBe('2026-06-13');
    expect(block.payload.points.map((p) => p.date)).toEqual(['2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13']);
    expect(block.payload.points.every((p) => p.amount === 0)).toBe(true); // the model's 8 Jun point is outside the window
  });

  it('short-circuits with a clarification when a per-day range is too long (no LLM, no DB)', async () => {
    const llm = fakeLlm({});
    const response = await runAgentTurn(makeDeps(llm), USER_ID, chat('daily spending for the last 60 days'));
    expect(response.answer).toContain('40 days');
    expect(response.blocks).toEqual([]);
    expect(response.deep_link).toBeNull();
    expect(llm.calls).toHaveLength(0);
  });

  it('trims history to AGENT_CONTEXT_MAX_MESSAGES in the respond prompt', async () => {
    const llm = fakeLlm({ classify: [noCompare], sql: [{ sql: 'SELECT 1 AS x FROM transactions' }], respond: [respondOk('ok')] });
    const sql = fakeSqlClient({ onSelect: () => [{ x: 1 }] });
    const history = Array.from({ length: 6 }, (_, i) => ({ role: i % 2 === 0 ? ('user' as const) : ('assistant' as const), content: `turn ${i}` }));
    const deps = makeDeps(llm, {}, sql.client);
    deps.config = { ...deps.config, contextMaxMessages: 2 };
    await runAgentTurn(deps, USER_ID, chat('and now?', { history }));
    const prompt = JSON.parse(llm.of('respond')[0]?.user ?? '{}') as { conversation: string };
    expect(prompt.conversation).toBe('User: turn 4\nAssistant: turn 5\nUser: and now?');
  });
});

describe('runAgentTurn: classification', () => {
  it('a failing classifier falls back to standard SQL routing', async () => {
    const llm = fakeLlm({
      classify: [new TransientAiError('down')],
      sql: [{ sql: 'SELECT 1 AS x FROM transactions' }],
      respond: [respondOk('fine')],
    });
    const sql = fakeSqlClient({ onSelect: () => [{ x: 1 }] });
    expect((await runAgentTurn(makeDeps(llm, {}, sql.client), USER_ID, chat('june vs may'))).answer).toBe('fine');
    expect(llm.of('sql')).toHaveLength(1);
  });

  it('an unusable comparison (month missing) also falls back to SQL routing', async () => {
    const llm = fakeLlm({
      classify: [{ comparison_kind: 'month_pair', period_a: { year: 2026, month: null }, period_b: { year: 2026, month: 5 } }],
      sql: [{ sql: 'SELECT 1 AS x FROM transactions' }],
      respond: [respondOk('fine')],
    });
    const sql = fakeSqlClient({ onSelect: () => [{ x: 1 }] });
    await runAgentTurn(makeDeps(llm, {}, sql.client), USER_ID, chat('compare june'));
    expect(llm.of('sql')).toHaveLength(1);
  });

  it('classifier prompt carries the NOW block of the request timezone and the user text only', async () => {
    const llm = fakeLlm({ classify: [noCompare], sql: [{ sql: 'SELECT 1 FROM transactions' }], respond: [respondOk('ok')] });
    const sql = fakeSqlClient({ onSelect: () => [] });
    await runAgentTurn(makeDeps(llm, {}, sql.client), USER_ID, chat('hello there', { timezone: 'America/New_York' }));
    const call = llm.of('classify')[0];
    expect(call?.user).toBe('hello there');
    expect(call?.system).toContain('Timezone: America/New_York');
    expect(call?.system).toContain('Today: 2026-06-13 (Saturday)');
  });
});

describe('runAgentTurn: compare route (no SQL)', () => {
  const daily = (days: Record<string, [number, number]>) =>
    Object.entries(days).map(([day, [credit, debit]]) => ({ day, credit_total: credit, debit_total: debit, credit_count: credit ? 1 : 0, debit_count: debit ? 1 : 0 }));
  const payees = (rows: [string, string, number, string][]) =>
    rows.map(([type, key, total, name]) => ({ type, payee_key: key, display_name: name, total, transaction_count: 1 }));

  it('month pair: two month aggregates, compare_months block, LLM prose only', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_daily_totals', (call) => {
      const from = (call.body as { p_from: string }).p_from;
      return json(from.startsWith('2026-05-31') ? daily({ '2026-06-10': [0, 18388] }) : daily({ '2026-05-10': [50000, 22450] }));
    });
    stub.on('POST', '/rest/v1/rpc/transactions_payee_totals', (call) => {
      const from = (call.body as { p_from: string }).p_from;
      return json(from.startsWith('2026-05-31') ? payees([['debit', 'swiggy', 18388, 'Swiggy']]) : payees([['debit', 'amazon', 22450, 'Amazon']]));
    });
    const llm = fakeLlm({
      classify: [MONTH_COMPARE],
      respond: [respondOk('You spent **₹18,388** in Jun 2026 vs **₹22,450** in May — **18% less**.', { chart: { chart_kind: 'donut', series: [{ name: 'x', value: 1 }] } })],
    });
    const response = await runAgentTurn(makeDeps(llm), USER_ID, chat('june vs may'));

    expect(llm.calls.map((c) => c.node)).toEqual(['classify', 'respond']);
    expect(response.deep_link).toBeNull();
    expect(response.blocks).toHaveLength(1); // the model's donut is ignored: the compare card wins
    const block = response.blocks[0] as Record<string, unknown> & { period_a: Record<string, unknown>; period_b: Record<string, unknown> };
    expect(block).toMatchObject({ type: 'compare_months', period_a_label: 'Jun 2026', period_b_label: 'May 2026' });
    expect(block).not.toHaveProperty('chart_label');
    expect(block.period_a).toMatchObject({ spent: 18388, income: 0, net: -18388, payees: [{ name: 'Swiggy', amount: 18388, share: 1 }] });
    expect(block.period_b).toMatchObject({ spent: 22450, income: 50000, net: 27550 });
    expect((block.period_a['cashflow'] as unknown[]).length).toBe(30); // days of June

    const prompt = JSON.parse(llm.of('respond')[0]?.user ?? '{}') as { compare_insights: Record<string, unknown>; last_result: { rows: unknown[] }; time_range: { kind: string } };
    expect(prompt.time_range.kind).toBe('compare');
    expect(prompt.compare_insights).toMatchObject({
      period_a_label: 'Jun 2026',
      period_a: { spent: 18388, active_spend_days: 1, peak_spend_date: '2026-06-10', peak_spend_amount: 18388 },
      deltas: { spent_pct: -18.1, active_days_delta: 0 },
    });
    expect(prompt.last_result.rows).toEqual([{ period: 'Jun 2026', period_a_amount: 18388, period_b_amount: 22450 }]);

    // Both months were queried over half-open IST ranges; no media signing, no top-expense query.
    const ranges = stub.find('POST', '/rpc/transactions_daily_totals').map((c) => c.body as { p_from: string; p_to: string; p_tz: string });
    expect(ranges.map((r) => r.p_tz)).toEqual(['Asia/Kolkata', 'Asia/Kolkata']);
    expect(ranges.map((r) => r.p_from).sort()).toEqual(['2026-04-30T18:30:00.000Z', '2026-05-31T18:30:00.000Z']);
    expect(stub.find('GET', '/rest/v1/transactions')).toHaveLength(0);
  });

  it('year pair: one aggregate per year, monthly cashflow, chart_label', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_daily_totals', (call) => {
      const from = (call.body as { p_from: string }).p_from;
      return json(from.startsWith('2026') || from.startsWith('2025-12') ? daily({ '2026-03-05': [0, 1000], '2026-06-01': [0, 500] }) : daily({ '2025-02-02': [0, 4000] }));
    });
    stub.on('POST', '/rest/v1/rpc/transactions_payee_totals', () => json(payees([['debit', 'amazon', 1500, 'Amazon']])));
    const llm = fakeLlm({ classify: [YEAR_COMPARE], respond: [respondOk('You are on pace for a lower year.')] });
    const response = await runAgentTurn(makeDeps(llm), USER_ID, chat('2026 vs 2025'));

    const block = response.blocks[0] as { type: string; chart_label: string; period_a_label: string; period_b_label: string; period_a: { cashflow: { date: string; expense: number }[] }; period_b: { cashflow: unknown[] } };
    expect(block).toMatchObject({ type: 'compare_months', chart_label: 'Monthly Spend', period_a_label: '2026 (YTD)', period_b_label: '2025' });
    expect(block.period_a.cashflow).toHaveLength(6); // Jan..Jun
    expect(block.period_a.cashflow[2]).toEqual({ date: '2026-03-01', expense: 1000, income: 0 });
    expect(block.period_b.cashflow).toHaveLength(12);
    const prompt = JSON.parse(llm.of('respond')[0]?.user ?? '{}') as { compare_insights: { period_a: Record<string, unknown> } };
    expect(prompt.compare_insights.period_a).toMatchObject({ active_spend_months: 2, peak_spend_month: 'Mar', peak_spend_amount: 1000 });
    expect(prompt.compare_insights.period_a).not.toHaveProperty('active_spend_days');
    // 2026 YTD window ends today (13 Jun IST => exclusive bound 14 Jun 00:00 IST).
    const ranges = stub.find('POST', '/rpc/transactions_daily_totals').map((c) => (c.body as { p_to: string }).p_to).sort();
    expect(ranges).toContain('2026-06-13T18:30:00.000Z');
    expect(ranges).toContain('2025-12-31T18:30:00.000Z');
  });

  it('falls back to the SQL route (which understands compare ranges) when the aggregates fail', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_daily_totals', () => pgError('XX000', 'boom', 500));
    stub.on('GET', '/rest/v1/transactions', () => pgError('XX000', 'boom', 500));
    const llm = fakeLlm({
      classify: [MONTH_COMPARE],
      sql: [{ sql: 'SELECT SUM(amount) AS period_a_total FROM transactions' }],
      respond: [respondOk('Compared.')],
    });
    const sql = fakeSqlClient({ onSelect: () => [{ period_a_total: 100, period_b_total: 200 }] });
    const response = await runAgentTurn(makeDeps(llm, {}, sql.client), USER_ID, chat('june vs may'));

    expect(llm.of('sql')).toHaveLength(1);
    expect(llm.of('sql')[0]?.user).toContain('"kind":"compare"');
    // The compare_bar is built from the SQL columns even though the model sent no chart.
    expect(response.blocks).toEqual([
      {
        type: 'mini_chart',
        chart_kind: 'compare_bar',
        payload: {
          title: 'Jun 2026 vs May 2026',
          period_a_label: 'Jun 2026',
          period_b_label: 'May 2026',
          compare_series: [{ name: 'Total spending', period_a: 100, period_b: 200 }],
        },
      },
    ]);
  });
});

describe('runAgentTurn: model failures and fallback', () => {
  it('uses the fallback model after the primary fails', async () => {
    let n = 0;
    const llm = fakeLlm({ classify: [noCompare], sql: [{ sql: 'SELECT 1 AS x FROM transactions' }], respond: [respondOk('ok')] });
    const flaky = {
      ...llm,
      post: ((url, options) => {
        const model = (options.json as { model: string }).model;
        if (model === 'primary' && (n += 1) > 0) return Promise.reject(new TransientAiError('503'));
        return llm.post(url, options);
      }) satisfies typeof llm.post,
    };
    const sql = fakeSqlClient({ onSelect: () => [{ x: 1 }] });
    const deps = makeDeps(flaky, {}, sql.client);
    deps.config = { ...deps.config, model: 'primary', modelFallback: 'fallback' };
    deps.llm = { ...deps.llm, agent: deps.config };
    const response = await runAgentTurn(deps, USER_ID, chat('hello'));
    expect(response.answer).toBe('ok');
    expect(llm.calls.every((c) => c.model === 'fallback')).toBe(true);
    expect(n).toBe(3); // each of the three steps tried the primary first
  });

  it('retries the same model once when no fallback is configured and the answer was unusable', async () => {
    const llm = fakeLlm({ classify: [noCompare], sql: [{ sql: 'SELECT 1 AS x FROM transactions' }], respond: ['not json', respondOk('second try')] });
    const sql = fakeSqlClient({ onSelect: () => [{ x: 1 }] });
    const response = await runAgentTurn(makeDeps(llm, {}, sql.client), USER_ID, chat('hello'));
    expect(response.answer).toBe('second try');
    expect(llm.of('respond')).toHaveLength(2);
  });

  it('does not retry a permanent provider error on the same model', async () => {
    const llm = fakeLlm({ classify: [noCompare], sql: [new PermanentAiError('deepseek returned 401.')], respond: [respondOk('x')] });
    await expect(runAgentTurn(makeDeps(llm), USER_ID, chat('hello'))).rejects.toBeInstanceOf(PermanentAiError);
    expect(llm.of('sql')).toHaveLength(1);
  });

  it('an unusable SQL answer is "no SQL": the loop is bounded and respond still runs', async () => {
    const llm = fakeLlm({ classify: [noCompare], sql: ['{"nothing": true}'], respond: [respondOk('I could not look that up.')] });
    const response = await runAgentTurn(makeDeps(llm), USER_ID, chat('hello'));
    expect(response.answer).toBe('I could not look that up.');
    expect(llm.of('respond')).toHaveLength(1);
  });

  it('an unusable respond answer fails the turn', async () => {
    const llm = fakeLlm({ classify: [noCompare], sql: [{ sql: 'SELECT 1 FROM transactions' }], respond: ['nope'] });
    const sql = fakeSqlClient({ onSelect: () => [] });
    await expect(runAgentTurn(makeDeps(llm, {}, sql.client), USER_ID, chat('hello'))).rejects.toBeInstanceOf(PermanentAiError);
  });

  it('a missing API key is a permanent error', async () => {
    const llm = fakeLlm({ classify: [noCompare] });
    const deps = makeDeps(llm);
    deps.llm = { ...deps.llm, apiKey: undefined };
    // classify swallows it (standard routing), generate_sql does not
    await expect(runAgentTurn(deps, USER_ID, chat('hello'))).rejects.toThrow(/DEEPSEEK_API_KEY/);
  });

  it('propagates an unreachable database', async () => {
    const llm = fakeLlm({ classify: [noCompare], sql: [{ sql: 'SELECT 1 FROM transactions' }] });
    const deps = makeDeps(llm, { openSql: () => Promise.reject(new AgentDbUnavailableError('down')) });
    await expect(runAgentTurn(deps, USER_ID, chat('hello'))).rejects.toBeInstanceOf(AgentDbUnavailableError);
  });

  it('sends the documented request to DeepSeek: JSON mode, temperature 0, thinking disabled', async () => {
    const seen: { url: string; json: Record<string, unknown>; timeoutMs: number | undefined; headers: unknown }[] = [];
    const llm = fakeLlm({ classify: [noCompare], sql: [{ sql: 'SELECT 1 FROM transactions' }], respond: [respondOk('ok')] });
    const spy = { post: ((url, options) => (seen.push({ url, json: options.json as Record<string, unknown>, timeoutMs: options.timeoutMs, headers: options.headers }), llm.post(url, options))) satisfies typeof llm.post };
    const sql = fakeSqlClient({ onSelect: () => [] });
    await runAgentTurn(makeDeps(spy, {}, sql.client), USER_ID, chat('hello'));
    expect(seen).toHaveLength(3);
    for (const call of seen) {
      expect(call.url).toBe('https://api.deepseek.com/chat/completions');
      expect(call.json).toMatchObject({ temperature: 0, response_format: { type: 'json_object' }, thinking: { type: 'disabled' } });
      expect(call.timeoutMs).toBe(45_000);
      expect(call.headers).toEqual({ authorization: 'Bearer test-key' });
    }
  });

  it('is deterministic about the clock it was given', () => {
    expect(JUN13).toBe(Date.parse('2026-06-13T09:30:00Z'));
  });
});
