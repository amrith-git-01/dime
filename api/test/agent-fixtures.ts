import { getConfig } from '../src/core/env';
import { emptyUsage } from '../src/features/agent/llm';
import type { ChatMessage, LlmClient, LlmRequest, LlmResult, ToolCall, Usage } from '../src/features/agent/llm';
import type { AgentDeps, AgentEvent, TurnOptions, TurnResult } from '../src/features/agent/service';
import { runAgentTurn } from '../src/features/agent/service';
import type { AgentQueries, QueryName } from '../src/features/agent/queries';
import { testDb } from './db';
import { makeEnv } from './helpers';

/** 2026-10-05 10:00 IST. */
export const NOW = Date.parse('2026-10-05T10:00:00+05:30');
export const USER = '11111111-1111-1111-1111-111111111111';
export const SECRET = 'test-agent-memory-secret-with-enough-length';

function agentConfig(overrides: Record<string, unknown> = {}) {
  return { ...getConfig(makeEnv()).agent, modelFallback: undefined, memorySecret: SECRET, ...overrides };
}

export const toolCall = (name: string, args: unknown, id = `call_${name}`): ToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
});

/** One scripted model turn: text, tool calls, an error, or a hook run before answering. */
export interface Step {
  content?: string;
  calls?: ToolCall[];
  usage?: Partial<Usage>;
  /** Thrown from the model call (as the client would). */
  error?: Error;
  /** Runs when the call starts (advance a fake clock, abort a signal...). */
  before?: (request: LlmRequest) => void;
}

export function scriptedLlm(steps: Step[]) {
  const calls: { request: LlmRequest; messages: ChatMessage[] }[] = [];
  const llm: LlmClient = (request) => {
    // The service mutates the same messages array between calls: keep a snapshot of each request.
    calls.push({ request, messages: structuredClone([...request.messages]) });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (!step) return Promise.reject(new Error('no scripted step'));
    step.before?.(request);
    if (step.error) return Promise.reject(step.error);
    const content = step.content ?? '';
    // Streaming callers get the text in small pieces, like the real client (only when no tool call follows).
    if (request.onDelta && !step.calls?.length) for (const piece of content.match(/.{1,12}/gs) ?? []) request.onDelta(piece);
    const result: LlmResult = {
      model: request.model,
      content,
      toolCalls: step.calls ?? [],
      finishReason: step.calls?.length ? 'tool_calls' : 'stop',
      usage: { ...emptyUsage(), promptTokens: 100, completionTokens: 20, cacheHitTokens: 60, ...step.usage },
      ms: 5,
    };
    return Promise.resolve(result);
  };
  return { llm, calls };
}

export const QUERY_NAMES: readonly QueryName[] = [
  'resolve_entities',
  'spending_summary',
  'category_breakdown',
  'top_payees',
  'daily_cashflow',
  'compare_periods',
  'budget_status',
  'list_transactions',
  'aggregate_transactions',
];

export interface FakeQueries {
  /** Pass to `makeDeps`: every tool query answers with its handler (a document, or a function of the params). */
  queries: AgentQueries;
  /** Every query run, in order, with the params the tool planned. */
  calls: () => { name: QueryName; params: unknown }[];
}

/**
 * A stand-in for the D1 tool queries: answers with canned documents (the jsonb the Postgres functions used
 * to return) and records what the tools asked. `fail` makes one query throw.
 */
export function fakeQueries(handlers: Partial<Record<QueryName, unknown>> = {}, opts: { fail?: Partial<Record<QueryName, Error>> } = {}): FakeQueries {
  const calls: { name: QueryName; params: unknown }[] = [];
  const queries = Object.fromEntries(
    QUERY_NAMES.map((name) => [
      name,
      (_db: unknown, _userId: string, params: unknown) => {
        calls.push({ name, params });
        const failure = opts.fail?.[name];
        if (failure) return Promise.reject(failure);
        const handler = handlers[name];
        return Promise.resolve((typeof handler === 'function' ? (handler as (p: unknown) => unknown)(params) : handler) ?? {});
      },
    ]),
  ) as unknown as AgentQueries;
  return { queries, calls: () => calls };
}

/** Queries that must not run in the test (a turn that needs no data never queries). */
const unexpectedQueries = Object.fromEntries(
  QUERY_NAMES.map((name) => [name, () => Promise.reject(new Error(`the database was not expected in this test (${name})`))]),
) as unknown as AgentQueries;

export const noEntities = { matches: [] };

export function makeDeps(llm: LlmClient, fake: FakeQueries | null, overrides: Partial<AgentDeps> = {}, config: Record<string, unknown> = {}): AgentDeps {
  return {
    config: agentConfig(config),
    llm,
    db: testDb(),
    queries: fake ? fake.queries : unexpectedQueries,
    now: () => NOW,
    newId: () => '00000000-0000-4000-8000-000000000abc',
    ...overrides,
  };
}

export interface RunResult {
  result: TurnResult;
  events: AgentEvent[];
}

export async function run(
  deps: AgentDeps,
  content: string,
  extra: Partial<TurnOptions['body']> = {},
  opts: Partial<TurnOptions> = {},
): Promise<RunResult> {
  const events: AgentEvent[] = [];
  const result = await runAgentTurn(deps, {
    userId: USER,
    body: { content, timezone: 'Asia/Kolkata', history: [], ...extra },
    signal: new AbortController().signal,
    emit: (e) => events.push(e),
    ...opts,
  });
  return { result, events };
}

export const SUMMARY_JUNE = { debit: 18388.5, credit: 85000, net: 66611.5, debit_count: 40, credit_count: 3, count: 43 };
export const JUNE = { from: '2026-06-01', to: '2026-06-30' };
