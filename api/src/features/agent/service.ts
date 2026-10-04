import type { AppConfig } from '../../core/env';
import { log } from '../../core/logging';
import type { DimeSupabaseClient } from '../../core/supabase';
import { resolveTimezone, today } from './dates';
import { parseRespondJson } from './chart';
import type { ParsedRespond } from './chart';
import { enrichCompareBlocks } from './compare-blocks';
import { fetchCompareInsights, fetchYearCompareInsights } from './compare-insights';
import type { CompareBlock, CompareSummary } from './compare-insights';
import { resolveDeepLinkIds } from './deep-link';
import { UnusableOutputError, callAgentJson, jsonParser } from './llm';
import type { LlmDeps } from './llm';
import { CLASSIFY_INTENT_SYSTEM, RESPOND_SYSTEM, generateSqlSystem } from './prompts';
import { classifyOutputSchema, sqlOutputSchema } from './schemas';
import type { ChatHistoryMessage, ChatRequest, ChatResponse, MiniChartBlock, SqlAttempt } from './schemas';
import { executeReadonlySql } from './sql-executor';
import type { SqlClient } from './sql-executor';
import { prependTemporalContext } from './temporal-context';
import {
  MAX_DAILY_COMPARISON_DAYS,
  buildCompareTimeRange,
  fillCashflowPoints,
  isCompareRange,
  resolveDailyComparisonRange,
  resolveTimeRange,
} from './time-range';
import type { CompareRange, TimeRange } from './time-range';

/**
 * The agent turn: a plain typed async loop over the same steps as the Python LangGraph.
 *
 *   classifyIntent -> compare (month_pair | year_pair) ? fetchCompareData : (generateSql -> executeSql -> reflect)*
 *                  -> respond
 *
 * Stateless: the client sends the history with every request. Bounded work per turn: at most
 * 1 classify + `maxToolRounds` x (1 SQL generation) + 1 respond LLM calls (each with at most one
 * retry/fallback attempt), one Hyperdrive transaction per round, and no other subrequests (the compare
 * path replaces the SQL rounds with two insights aggregates).
 */

export interface AgentDeps {
  config: AppConfig['agent'];
  llm: LlmDeps;
  /** Opens the read-only agent database client (lazily: compare turns never need it). */
  openSql: () => Promise<SqlClient>;
  /** Service-role Supabase client for the compare path (always filtered by the JWT user id). */
  supabase: () => DimeSupabaseClient;
  /** Epoch ms; overridable for tests. */
  now?: () => number;
}

interface AgentState {
  history: ChatHistoryMessage[];
  userText: string;
  timezone: string | null;
  timeRange: TimeRange | null;
  sqlAttempts: SqlAttempt[];
  lastResult: Record<string, unknown> | null;
  nextSqlHint: string | null;
  queryRounds: number;
  uiBlocks: Record<string, unknown>[];
  compareInsights: CompareSummary | null;
}

interface Timing {
  step: string;
  ms: number;
}

const BUDGET_HINT =
  'Join budgets with SUM(debit transactions) for the resolved month using ' +
  'transaction_at >= time_range.start_iso AND transaction_at <= time_range.end_iso. ' +
  'Return monthly_budget and spent in one row.';
const BUDGET_SPEND_KEYS = ['spent', 'total_spent', 'spend', 'total', 'amount'] as const;
const DEFAULT_CLASSIFY_TIMEZONE = 'Asia/Kolkata';
/** Hard stop for one turn regardless of the model's behavior. */
const MAX_TURN_MS = 120_000;

const stripped = (s: string) => s.trim();
const clock = (deps: AgentDeps): number => deps.now?.() ?? Date.now();

/** Prior turns, most recent `max`. */
export function trimHistory(history: readonly ChatHistoryMessage[], max: number): ChatHistoryMessage[] {
  return history.length <= max ? [...history] : history.slice(-max);
}

/** "User: ..." / "Assistant: ..." lines of the conversation including the current question. */
export function formatTranscript(history: readonly ChatHistoryMessage[], current: string): string {
  const lines: string[] = [];
  for (const m of [...history, { role: 'user' as const, content: current }]) {
    const text = stripped(m.content);
    if (text) lines.push(`${m.role === 'user' ? 'User' : 'Assistant'}: ${text}`);
  }
  return lines.join('\n');
}

/* ----------------------------------------------------------------------------------------------
 * reflect (deterministic) and the budget guard
 * -------------------------------------------------------------------------------------------- */

/** Retry hint when a budget question returned no usable spend data (port of `_budget_spend_guard`). */
export function budgetSpendGuard(input: {
  userText: string;
  lastResult: { rows?: unknown; error?: unknown } | null;
  sqlAttempts: readonly Pick<SqlAttempt, 'sql'>[];
}): string | null {
  if (!input.userText.toLowerCase().includes('budget')) return null;
  const last = input.lastResult ?? {};
  if (last.error) return null; // a SQL error is handled by reflect itself

  const lastSql = (input.sqlAttempts.at(-1)?.sql ?? '').toLowerCase();
  if (!lastSql.includes('transactions')) return BUDGET_HINT;

  const rows = Array.isArray(last.rows) ? last.rows : [];
  if (rows.length === 0) return BUDGET_HINT;
  const first = typeof rows[0] === 'object' && rows[0] !== null && !Array.isArray(rows[0]) ? (rows[0] as Record<string, unknown>) : {};
  if (!BUDGET_SPEND_KEYS.some((k) => k in first)) return BUDGET_HINT;
  return null;
}

/** Deterministic retry check, no LLM: a SQL error or a budget answer without spend data asks for another round. */
export function reflect(state: Pick<AgentState, 'userText' | 'lastResult' | 'sqlAttempts'>): string | null {
  const error = (state.lastResult as { error?: unknown } | null)?.error;
  if (error) return `Fix SQL error: ${typeof error === 'string' ? error : JSON.stringify(error)}`;
  return budgetSpendGuard({ userText: state.userText, lastResult: state.lastResult, sqlAttempts: state.sqlAttempts });
}

/** After reflect: another SQL round only with a hint and while rounds remain (Python `route_after_reflect`). */
export function shouldRetrySql(state: Pick<AgentState, 'nextSqlHint' | 'queryRounds'>, maxRounds: number): boolean {
  if (state.queryRounds >= maxRounds) return false;
  return Boolean(state.nextSqlHint);
}

/** Compare questions with a month/year pair skip SQL generation entirely. */
export function routeAfterClassify(timeRange: TimeRange | null): 'fetch_compare_data' | 'generate_sql' {
  return isCompareRange(timeRange) ? 'fetch_compare_data' : 'generate_sql';
}

/* ----------------------------------------------------------------------------------------------
 * Steps
 * -------------------------------------------------------------------------------------------- */

async function classifyIntent(deps: AgentDeps, state: AgentState): Promise<CompareRange | null> {
  const tzName = state.timezone?.trim() || DEFAULT_CLASSIFY_TIMEZONE;
  try {
    const { value } = await callAgentJson(deps.llm, {
      node: 'classify_intent',
      system: prependTemporalContext(CLASSIFY_INTENT_SYSTEM, state.timezone, clock(deps)),
      user: state.userText,
      parse: jsonParser(classifyOutputSchema),
    });
    const { comparison_kind: kind, period_a: a, period_b: b } = value;
    if (!kind || !a || !b) return null;

    const tz = resolveTimezone(tzName);
    const nowMs = clock(deps);
    return buildCompareTimeRange(kind, a, b, { tz, today: today(tz, nowMs) });
  } catch (err) {
    // Any failure here just means "standard routing" (SQL), exactly like the Python node.
    log.warn('agent_classify_failed', { err: String(err) });
    return null;
  }
}

async function fetchCompareData(deps: AgentDeps, state: AgentState, userId: string, range: CompareRange): Promise<void> {
  const timezone = state.timezone?.trim() || DEFAULT_CLASSIFY_TIMEZONE;
  const tz = resolveTimezone(timezone);
  const db = deps.supabase();
  const { block, summary }: { block: CompareBlock; summary: CompareSummary } =
    range.subkind === 'year_pair'
      ? await fetchYearCompareInsights(db, userId, range, tz)
      : await fetchCompareInsights(db, userId, range, tz);

  state.compareInsights = summary;
  state.lastResult = {
    row_count: 2,
    rows: [
      { period: summary.period_a_label, period_a_amount: summary.period_a['spent'], period_b_amount: summary.period_b['spent'] },
    ],
    columns: ['period', 'period_a_amount', 'period_b_amount'],
    truncated: false,
    error: null,
  };
  state.uiBlocks = [block as unknown as Record<string, unknown>];
}

async function generateSql(deps: AgentDeps, state: AgentState): Promise<string | null> {
  const parts = [state.userText];
  if (state.timeRange) {
    parts.push(`\ntime_range (use these bounds exactly): ${JSON.stringify(state.timeRange)}`);
    if ((state.timeRange as { daily_comparison?: boolean }).daily_comparison) {
      parts.push(`Per-day breakdown requested — max ${MAX_DAILY_COMPARISON_DAYS} days.`);
    }
  }
  if (state.nextSqlHint) parts.push(`\nFix hint from previous attempt: ${state.nextSqlHint}`);

  try {
    const { value } = await callAgentJson(deps.llm, {
      node: 'generate_sql',
      system: prependTemporalContext(generateSqlSystem(), state.timezone, clock(deps)),
      user: parts.join('\n'),
      parse: jsonParser(sqlOutputSchema),
    });
    return value.sql.trim() || null;
  } catch (err) {
    // The model answering without a usable statement is not fatal (Python: "no run_sql tool call"):
    // the loop's round limit applies and respond explains. Provider outages still abort the turn.
    if (err instanceof UnusableOutputError) {
      log.warn('agent_generate_sql_unusable', { err: String(err) });
      return null;
    }
    throw err;
  }
}

async function executeSql(deps: AgentDeps, state: AgentState, userId: string, sql: string): Promise<void> {
  const round = state.queryRounds + 1;
  const sqlClient = await deps.openSql();
  const result = await executeReadonlySql(sqlClient, sql, {
    userId,
    maxRows: deps.config.sqlMaxRows,
    timeoutMs: deps.config.sqlTimeoutMs,
  });
  state.lastResult = result as unknown as Record<string, unknown>;
  state.sqlAttempts = [...state.sqlAttempts, { sql, row_count: result.row_count, error: result.error, elapsed_ms: result.elapsed_ms, round }];
  state.queryRounds = round;
  log.info('agent_sql', {
    round,
    rows: result.row_count,
    ms: result.elapsed_ms,
    error: result.error ? result.error.slice(0, 200) : null,
    sql: sql.slice(0, 300),
  });
}

function respondPayload(state: AgentState): string {
  const payload: Record<string, unknown> = {
    user_question: state.userText,
    conversation: formatTranscript(state.history, state.userText),
    time_range: state.timeRange,
    last_result: state.lastResult,
    sql_attempts: state.sqlAttempts,
    error: null,
  };
  if (state.compareInsights) payload['compare_insights'] = state.compareInsights;
  return JSON.stringify(payload);
}

/** Gap-fill cashflow charts over the authoritative range (port of `enrich_cashflow_blocks`). */
function enrichCashflowBlocks(blocks: MiniChartBlock[], timeRange: TimeRange | null): void {
  const range = timeRange as { start_date?: unknown; end_date?: unknown } | null;
  if (!range || typeof range.start_date !== 'string' || typeof range.end_date !== 'string') return;
  for (const block of blocks) {
    if (block.chart_kind !== 'cashflow') continue;
    const points = Array.isArray(block.payload.points) ? block.payload.points : [];
    block.payload = {
      ...block.payload,
      start_date: range.start_date,
      end_date: range.end_date,
      points: fillCashflowPoints(points, range.start_date, range.end_date).slice(0, MAX_DAILY_COMPARISON_DAYS),
    };
  }
}

async function respond(deps: AgentDeps, state: AgentState): Promise<ChatResponse> {
  const { value: parsed } = await callAgentJson<ParsedRespond>(deps.llm, {
    node: 'respond',
    system: prependTemporalContext(RESPOND_SYSTEM, state.timezone, clock(deps)),
    user: respondPayload(state),
    parse: parseRespondJson,
  });

  const blocks: MiniChartBlock[] = [...parsed.blocks];
  enrichCashflowBlocks(blocks, state.timeRange);

  let finalBlocks: Record<string, unknown>[];
  if (state.compareInsights) {
    // The pre-built compare_months card wins over any model chart.
    const compareMonths = state.uiBlocks.filter((b) => b['type'] === 'compare_months');
    finalBlocks = compareMonths.length > 0 ? compareMonths : (blocks as unknown as Record<string, unknown>[]);
  } else {
    enrichCompareBlocks(blocks, { timeRange: state.timeRange, lastResult: state.lastResult });
    finalBlocks = blocks as unknown as Record<string, unknown>[];
  }

  const deepLink = resolveDeepLinkIds(parsed.deepLink, { lastResult: state.lastResult, timeRange: state.timeRange });
  return { answer: parsed.answer.slice(0, 4000), blocks: finalBlocks, deep_link: deepLink };
}

/* ----------------------------------------------------------------------------------------------
 * Turn
 * -------------------------------------------------------------------------------------------- */

export class TurnTimeoutError extends Error {
  override name = 'TurnTimeoutError';
}

export async function runAgentTurn(deps: AgentDeps, userId: string, body: ChatRequest): Promise<ChatResponse> {
  const nowMs = () => clock(deps);
  const started = nowMs();
  const timings: Timing[] = [];
  const timed = async <T>(step: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = nowMs();
    try {
      return await fn();
    } finally {
      timings.push({ step, ms: nowMs() - t0 });
    }
  };
  const checkDeadline = () => {
    if (nowMs() - started > MAX_TURN_MS) throw new TurnTimeoutError('Agent turn exceeded its time budget.');
  };

  // Single-period phrases and per-day requests are resolved deterministically before any LLM call.
  const resolved = resolveTimeRange(body.content, body.timezone, nowMs());
  const daily = resolveDailyComparisonRange({
    userText: body.content,
    goal: body.content,
    timeRange: resolved,
    timezone: body.timezone,
    nowMs: nowMs(),
  });
  const history = trimHistory(body.history, deps.config.contextMaxMessages);
  const userText = stripped(body.content);

  log.info('agent_turn_start', { userId, historyCount: history.length, timezone: body.timezone ?? null, chars: body.content.length });
  if (daily.clarification) {
    log.info('agent_turn_complete', { userId, ms: nowMs() - started, clarification: true });
    return { answer: daily.clarification, blocks: [], deep_link: null };
  }

  const state: AgentState = {
    history,
    userText,
    timezone: body.timezone?.trim() || null,
    timeRange: daily.timeRange,
    sqlAttempts: [],
    lastResult: null,
    nextSqlHint: null,
    queryRounds: 0,
    uiBlocks: [],
    compareInsights: null,
  };

  const compare = await timed('classify_intent', () => classifyIntent(deps, state));
  if (compare) state.timeRange = compare;

  let usedCompare = false;
  if (routeAfterClassify(state.timeRange) === 'fetch_compare_data') {
    try {
      await timed('fetch_compare_data', () => fetchCompareData(deps, state, userId, state.timeRange as CompareRange));
      usedCompare = true;
    } catch (err) {
      // The SQL route understands compare ranges too (see the generate-SQL prompt), so a failed
      // aggregate fetch degrades instead of failing the question.
      log.warn('agent_compare_fetch_failed', { err: String(err) });
    }
  }

  if (!usedCompare) {
    // Each iteration is one SQL generation; `queryRounds` counts executed statements (Python parity),
    // `iterations` also bounds rounds where the model produced nothing runnable.
    let iterations = 0;
    for (;;) {
      checkDeadline();
      iterations += 1;
      const sql = await timed('generate_sql', () => generateSql(deps, state));
      state.nextSqlHint = null;
      if (sql) await timed('execute_sql', () => executeSql(deps, state, userId, sql));
      state.nextSqlHint = reflect(state);
      const retry = shouldRetrySql({ nextSqlHint: state.nextSqlHint, queryRounds: state.queryRounds }, deps.config.maxToolRounds);
      if (!retry || iterations >= deps.config.maxToolRounds) break;
    }
  }

  checkDeadline();
  const response = await timed('respond', () => respond(deps, state));

  log.info('agent_turn_complete', {
    userId,
    ms: nowMs() - started,
    steps: timings,
    rounds: state.queryRounds,
    compare: usedCompare,
    blocks: response.blocks.length,
    deepLink: response.deep_link !== null,
  });
  return response;
}
