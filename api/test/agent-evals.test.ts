import { beforeEach, describe, expect, it } from 'vitest';

import { chunks } from '../src/core/db';
import { defaultQueries, executeQueries } from '../src/features/agent/queries';
import { runPrepass } from '../src/features/agent/prepass';
import { TOOL_BY_NAME } from '../src/features/agent/tools';
import { numbersIn } from '../src/features/agent/verify';
import { FIXTURE_USER_ID } from '../evals/fixture';
import goldenText from '../evals/golden.jsonl?raw';
import seedText from '../evals/seed.sql?raw';
import { testDb } from './db';

/**
 * The eval fixtures against the REAL tools on a local D1 (this replaces evals/validate.ts, which needed a
 * throwaway Postgres): `evals/seed.sql` is loaded, then every reference `plan` of `evals/golden.jsonl` runs
 * through the production path (argument validation -> query -> shaping) and each expected fact must appear in
 * the results. Clarification turns run through the pre-pass to prove the names are ambiguous in the data.
 * No LLM, no network. `npm run evals:validate` runs just this file.
 */

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

const golden = goldenText
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as Golden);

const TZ = 'Asia/Kolkata';
const NOW = Date.parse('2026-10-05T10:00:00+05:30');
const ctx = { tz: TZ, nowMs: NOW };

/** Money and counts are exact to the paisa; percentages to one decimal. */
const close = (fact: Fact, value: number): boolean => {
  if (fact.k === 'percent') return Math.abs(value - fact.v) <= 0.051;
  if (fact.k === 'count') return value === fact.v;
  return Math.abs(value - fact.v) <= 0.0051;
};

async function loadSeed(): Promise<number> {
  const statements = seedText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('--'));
  const db = testDb();
  for (const part of chunks(statements, 100)) await db.batch(part.map((s) => db.prepare(s)));
  return statements.length;
}

describe('eval fixtures on D1', () => {
  beforeEach(async () => {
    await loadSeed();
  });

  it('loads the seed: 384 transactions for the fixture user, in cents, with a payee key on each', async () => {
    const row = await testDb().prepare('SELECT COUNT(*) AS n, SUM(amount) AS s, COUNT(DISTINCT payee_key) AS p FROM transactions WHERE user_id = ?').bind(FIXTURE_USER_ID).first<{ n: number; s: number; p: number }>();
    expect(row?.n).toBe(384);
    expect(row?.p).toBeGreaterThan(20);
    expect(Number.isInteger(row?.s)).toBe(true);
    const odd = await testDb().prepare("SELECT COUNT(*) AS n FROM transactions WHERE transaction_at NOT LIKE '____-__-__T__:__:__.___Z' OR payee_key = '' OR payee_key IS NULL").first<{ n: number }>();
    expect(odd?.n).toBe(0);
  });

  it('every numeric fact is reachable through the real tools (all reference plans)', async () => {
    const failures: string[] = [];
    let planned = 0;
    let facts = 0;
    for (const g of golden) {
      for (const [i, turn] of g.turns.entries()) {
        const label = `${g.id}.${i + 1} "${turn.question}"`;
        if (!turn.facts?.length || turn.relative) continue;
        if (!turn.plan?.length) {
          failures.push(`${label}: has facts but no reference plan`);
          continue;
        }
        planned += 1;

        const numbers: number[] = [];
        for (const step of turn.plan) {
          const tool = TOOL_BY_NAME.get(step.tool);
          if (!tool) {
            failures.push(`${label}: unknown tool ${step.tool}`);
            continue;
          }
          const prepared = tool.prepare(JSON.stringify(step.args), ctx);
          const { results } = await executeQueries(defaultQueries, testDb(), FIXTURE_USER_ID, [prepared.call]);
          const r = results[0];
          if (!r?.ok) {
            failures.push(`${label}: ${step.tool} failed: ${r?.error ?? 'no result'}`);
            continue;
          }
          numbers.push(...numbersIn(prepared.shape(r.value, []).data));
        }
        for (const fact of turn.facts) {
          facts += 1;
          if (!numbers.some((n) => close(fact, n))) failures.push(`${label}: fact ${fact.k} ${fact.v} not found in the tool results`);
        }

        // The reference plan must itself satisfy the expected tool selection.
        const sets = [turn.tools ?? [], ...(turn.alt_tools ?? [])];
        const used = new Set(turn.plan.map((p) => p.tool));
        if (!sets.some((set) => set.every((t) => used.has(t)))) failures.push(`${label}: plan tools ${[...used].join(',')} satisfy none of the expected tool sets`);
      }
    }
    expect(failures).toEqual([]);
    // Guard against a vacuous pass.
    expect(planned).toBeGreaterThan(80);
    expect(facts).toBeGreaterThan(120);
  });

  it('answers the four former run_sql cases with aggregate_transactions', () => {
    const byId = new Map(golden.map((g) => [g.id, g]));
    for (const id of ['g100', 'g101', 'g102', 'g103']) {
      const turn = byId.get(id)?.turns[0];
      expect(turn?.tools).toEqual(['aggregate_transactions']);
      expect(turn?.plan).toHaveLength(1);
      expect(turn?.plan?.[0]?.tool).toBe('aggregate_transactions');
    }
  });

  it('every clarification question is ambiguous in the seeded data and offers the expected names', async () => {
    const failures: string[] = [];
    let checked = 0;
    for (const g of golden) {
      for (const turn of g.turns) {
        if (!turn.expect_clarification || !turn.clarify_options) continue;
        checked += 1;
        const pre = await runPrepass({ text: turn.question, tz: TZ, nowMs: NOW, userId: FIXTURE_USER_ID, memory: null, db: testDb(), queries: defaultQueries });
        const text = pre.clarification ?? '';
        for (const option of turn.clarify_options) if (!text.includes(option)) failures.push(`${g.id} "${turn.question}": clarification "${text}" does not offer ${option}`);
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  });
});
