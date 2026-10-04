/**
 * Validates the eval fixtures against a database that holds `seed.sql` and the migrations: every
 * numeric fact of `golden.jsonl` must be reachable through the agent's REAL tools.
 *
 *   DATABASE_URL=postgres://postgres:pg@127.0.0.1:54399/postgres npx tsx evals/validate.ts
 *
 * For every golden turn with a reference `plan` it runs each planned call through the production code
 * path (argument validation -> `agent_*` SQL function in a read-only transaction as role `authenticated`
 * with the fixture user's claims -> shaping) and checks that each expected fact appears in the results.
 * Clarification turns are checked through the pre-pass (pg_trgm). No LLM and no network: it proves the
 * seed, the SQL tools and the expectations agree. Exit code 1 on any mismatch.
 *
 * `run_sql` plans are executed as written, without the SQL validator (that needs the Workers WASM
 * loader; it is covered by its own tests and `npm run parity:validator`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectAgentDb } from '../src/features/agent/db';
import { runPrepass } from '../src/features/agent/prepass';
import { executeToolCalls } from '../src/features/agent/sql-executor';
import type { SqlClient } from '../src/features/agent/sql-executor';
import { TOOL_BY_NAME } from '../src/features/agent/tools';
import { numbersIn } from '../src/features/agent/verify';
import { FIXTURE_USER_ID } from './fixture';

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('Set DATABASE_URL to a database that has the migrations and evals/seed.sql applied.');
  process.exit(2);
}

interface Fact {
  v: number;
  k: 'money' | 'percent' | 'count';
}
interface Turn {
  question: string;
  tools?: string[];
  alt_tools?: string[][];
  facts?: Fact[];
  expect_clarification?: boolean;
  clarify_options?: string[];
  relative?: boolean;
  plan?: { tool: string; args: Record<string, unknown> }[];
}
interface Golden {
  id: string;
  turns: Turn[];
}

const golden = readFileSync(join(here, 'golden.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Golden);

const TZ = 'Asia/Kolkata';
const NOW = Date.parse('2026-10-05T10:00:00+05:30');
const ctx = { tz: TZ, nowMs: NOW };

/** Money and counts are exact to the paisa; percentages to one decimal; `run_sql` aggregates to a rupee. */
const close = (fact: Fact, value: number, loose: boolean): boolean => {
  if (fact.k === 'percent') return Math.abs(value - fact.v) <= 0.051;
  if (fact.k === 'count') return value === fact.v;
  return Math.abs(value - fact.v) <= (loose ? 1.0001 : 0.0051);
};

/** run_sql without the validator: the same transaction shape as the executor. */
async function rawSql(sql: SqlClient, query: string): Promise<unknown[]> {
  const claims = JSON.stringify({ sub: FIXTURE_USER_ID, role: 'authenticated', aud: 'authenticated' });
  return sql.begin('read only', async (tx) => {
    await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [claims]);
    await tx.unsafe('set local role authenticated');
    return [...(await tx.unsafe(query))];
  });
}

async function main(): Promise<void> {
  const sql = await connectAgentDb(url as string);
  let turns = 0;
  let planned = 0;
  let facts = 0;
  const failures: string[] = [];

  try {
    for (const g of golden) {
      for (const [i, turn] of g.turns.entries()) {
        const label = `${g.id}.${i + 1} "${turn.question}"`;
        turns += 1;

        if (turn.expect_clarification && turn.clarify_options) {
          const pre = await runPrepass({ text: turn.question, tz: TZ, nowMs: NOW, userId: FIXTURE_USER_ID, memory: null, openSql: () => Promise.resolve(sql), timeoutMs: 5000 });
          const text = pre.clarification ?? '';
          for (const option of turn.clarify_options) if (!text.includes(option)) failures.push(`${label}: clarification "${text}" does not offer ${option}`);
          continue;
        }
        if (!turn.facts?.length || turn.relative) continue;
        if (!turn.plan?.length) {
          failures.push(`${label}: has facts but no reference plan`);
          continue;
        }
        planned += 1;

        const numbers: number[] = [];
        let loose = false;
        for (const step of turn.plan) {
          const tool = TOOL_BY_NAME.get(step.tool);
          if (!tool) {
            failures.push(`${label}: unknown tool ${step.tool}`);
            continue;
          }
          const prepared = tool.prepare(JSON.stringify(step.args), ctx);
          if (prepared.kind === 'run_sql') {
            loose = true;
            numbers.push(...numbersIn(await rawSql(sql, prepared.query)));
            continue;
          }
          const { results } = await executeToolCalls(sql, FIXTURE_USER_ID, [prepared.call], { timeoutMs: 8000 });
          const r = results[0];
          if (!r?.ok) {
            failures.push(`${label}: ${step.tool} failed: ${r?.error ?? 'no result'}`);
            continue;
          }
          numbers.push(...numbersIn(prepared.shape(r.value, []).data));
        }
        for (const fact of turn.facts) {
          facts += 1;
          if (!numbers.some((n) => close(fact, n, loose))) failures.push(`${label}: fact ${fact.k} ${fact.v} not found in the tool results`);
        }

        // The reference plan must itself satisfy the expected tool selection.
        const sets = [turn.tools ?? [], ...(turn.alt_tools ?? [])];
        const used = new Set(turn.plan.map((p) => p.tool));
        if (!sets.some((set) => set.every((t) => used.has(t)))) failures.push(`${label}: plan tools ${[...used].join(',')} satisfy none of the expected tool sets`);
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(`conversations: ${golden.length}, turns: ${turns}, planned: ${planned}, facts checked: ${facts}`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} problem(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('OK: every fact is reachable through the tools and every clarification case is ambiguous in the database.');
}

await main();
