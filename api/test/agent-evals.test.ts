import { beforeEach, describe, expect, it } from 'vitest';

import { chunks } from '../src/core/db';
import { runPrepass } from '../src/features/agent/prepass';
import { defaultQueries } from '../src/features/agent/queries';
import { runGuardedSql } from '../src/features/agent/sql-guard';
import { FIXTURE_USER_ID } from '../evals/fixture';
import goldenText from '../evals/golden.jsonl?raw';
import seedText from '../evals/seed.sql?raw';
import { testDb } from './db';

/**
 * The eval fixtures against the REAL SQL guard on a local D1: `evals/seed.sql` is loaded, then every
 * reference `sql` of `evals/golden.jsonl` runs through the production path (view scoping, local dates,
 * rupee amounts) and each expected fact must appear among the numbers of the results. Clarification turns
 * run through the pre-pass to prove the names are ambiguous in the data. No LLM, no network.
 * `npm run evals:validate` runs just this file.
 */

interface Fact {
  v: number;
  k: 'money' | 'percent' | 'count';
}
interface Turn {
  question: string;
  facts?: Fact[];
  expect_clarification?: boolean;
  clarify_options?: string[];
  expect_no_sql?: boolean;
  relative?: boolean;
  sql?: string[];
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
const IST_MINUTES = 330;
const NOW = Date.parse('2026-10-05T10:00:00+05:30');

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

  it('every numeric fact is reachable through the real SQL guard (all reference queries)', async () => {
    const failures: string[] = [];
    let queried = 0;
    let facts = 0;
    for (const g of golden) {
      for (const [i, turn] of g.turns.entries()) {
        const label = `${g.id}.${i + 1} "${turn.question}"`;
        if (!turn.facts?.length || turn.relative) continue;
        if (!turn.sql?.length) {
          failures.push(`${label}: has facts but no reference sql`);
          continue;
        }
        queried += 1;

        const numbers: number[] = [];
        for (const sql of turn.sql) {
          const out = await runGuardedSql(testDb(), FIXTURE_USER_ID, sql, { tzOffsetMinutes: IST_MINUTES });
          if (!out.ok) {
            failures.push(`${label}: query failed: ${out.error}`);
            continue;
          }
          for (const row of out.rows) for (const cell of row) if (typeof cell === 'number') numbers.push(Math.abs(cell));
        }
        for (const fact of turn.facts) {
          facts += 1;
          if (!numbers.some((n) => close(fact, n))) failures.push(`${label}: fact ${fact.k} ${fact.v} not found in the query results`);
        }
      }
    }
    expect(failures).toEqual([]);
    // Guard against a vacuous pass.
    expect(queried).toBeGreaterThan(80);
    expect(facts).toBeGreaterThan(120);
  });

  it('the cases with no facts to find (small talk, injections, out of scope) carry no reference sql', () => {
    const noSql = golden.flatMap((g) => g.turns).filter((t) => t.expect_no_sql);
    expect(noSql.length).toBeGreaterThanOrEqual(4);
    for (const t of noSql) expect(t.sql).toBeUndefined();
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
