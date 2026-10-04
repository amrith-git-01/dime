import { createServiceClient } from '../src/core/supabase';
import { getConfig } from '../src/core/env';
import type { AiPostFn } from '../src/features/agent/llm';
import type { AgentDeps } from '../src/features/agent/service';
import type { SqlClient, SqlTx } from '../src/features/agent/sql-executor';
import { makeEnv } from './helpers';

export const JUN13 = Date.parse('2026-06-13T15:00:00+05:30');

type Row = Record<string, unknown>;

export interface LlmCall {
  node: 'classify' | 'sql' | 'respond';
  model: string;
  system: string;
  user: string;
}

type Step = unknown;

/** One scripted answer per call, in order; an Error is thrown (as `aiPost` would). The last entry repeats. */
export interface LlmScript {
  classify?: Step[];
  sql?: Step[];
  respond?: Step[];
}

export function fakeLlm(script: LlmScript) {
  const calls: LlmCall[] = [];
  const cursor = { classify: 0, sql: 0, respond: 0 };
  const post: AiPostFn = (_url, options) => {
    const json = options.json as { model: string; messages: { content: string }[] };
    const system = json.messages[0]?.content ?? '';
    const user = json.messages[1]?.content ?? '';
    const node = system.includes('Classify whether the user wants')
      ? 'classify'
      : system.includes('Write one read-only SELECT')
        ? 'sql'
        : 'respond';
    calls.push({ node, model: json.model, system, user });
    const steps = script[node] ?? [];
    const step = steps[Math.min(cursor[node]++, steps.length - 1)];
    if (step instanceof Error) return Promise.reject(step);
    if (step === undefined) return Promise.reject(new Error(`no scripted ${node} answer`));
    const content = typeof step === 'string' ? step : JSON.stringify(step);
    return Promise.resolve({ choices: [{ message: { content } }] });
  };
  return { post, calls, of: (node: LlmCall['node']) => calls.filter((c) => c.node === node) };
}

export interface FakeSqlOptions {
  /** Result for each executed SELECT (1-based call number); an Error is thrown from the transaction. */
  onSelect: (inner: string, n: number) => Row[] | Error;
}

export function fakeSqlClient(opts: FakeSqlOptions) {
  const selects: string[] = [];
  const statements: string[][] = [];
  const client: SqlClient = {
    begin: async <T>(_options: string, fn: (tx: SqlTx) => Promise<T>): Promise<T> => {
      const seen: string[] = [];
      statements.push(seen);
      const tx: SqlTx = {
        unsafe: (query) => {
          seen.push(query);
          if (!query.startsWith('SELECT * FROM')) return Promise.resolve([]);
          selects.push(query);
          const out = opts.onSelect(query, selects.length);
          return out instanceof Error ? Promise.reject(out) : Promise.resolve(out);
        },
      };
      return await fn(tx);
    },
    end: () => Promise.resolve(),
  };
  return { client, selects, statements };
}

export function makeDeps(llm: { post: AiPostFn }, overrides: Partial<AgentDeps> = {}, sql?: SqlClient): AgentDeps {
  const env = makeEnv();
  const config = { ...getConfig(env).agent, modelFallback: undefined, maxToolRounds: 3 };
  return {
    config,
    llm: { agent: config, apiKey: 'test-key', post: llm.post },
    openSql: () => (sql ? Promise.resolve(sql) : Promise.reject(new Error('SQL was not expected in this test'))),
    supabase: () => createServiceClient(env),
    now: () => JUN13,
    ...overrides,
  };
}

export const respondOk = (answer: string, extra: Record<string, unknown> = {}) => ({ answer, chart: null, deep_link: null, ...extra });
export const noCompare = { comparison_kind: null, period_a: null, period_b: null };
