/**
 * Live parity run: call the Python (FastAPI) and the TypeScript (Hono/Workers) backends with identical
 * requests against the SAME Supabase project and diff the responses.
 *
 *   PY_BASE_URL=http://127.0.0.1:8000 TS_BASE_URL=http://127.0.0.1:8787 ACCESS_TOKEN=<supabase access token> \
 *     npx tsx scripts/parity/parity.ts [--include-writes] [--include-agent] [--tokens] [--verbose] [--only text] [--month YYYY-MM]
 *
 * Env: PY_BASE_URL, TS_BASE_URL (origin, with or without /api/v1), ACCESS_TOKEN (a user's Supabase JWT),
 *      TIMEZONE (default Asia/Kolkata).
 *
 * Default run = READ-ONLY endpoints (GET) plus a few validation probes (no data is written). `GET /me` may
 * insert the users row / send the welcome email the first time a user is seen, exactly like the app does.
 *
 * `--include-writes` runs a create / update / delete scenario against a TEST ACCOUNT (use a dedicated
 * user!): category + budget + manual transaction (with Idempotency-Key and a replay) + push token, once
 * per backend with `-py` / `-ts` suffixed names, comparing status codes and response SHAPES, and always
 * cleans up what it created. `--include-agent` also POSTs one agent question (an LLM call, costs money).
 * `--tokens` additionally runs the offline unsubscribe-token cross-check (needs `uv`).
 *
 * Intentional deviations are normalised away (see normalize.ts): money "5000.0" vs "5000.00", "+00:00" vs
 * "Z", signed-URL query strings, request ids; ordering differences are WARN, everything else is DIFF.
 * Exit code 1 when any DIFF (or a failed write step) is found.
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { diffJson, normalize, shapeOf } from './normalize';
import type { Diff, Json } from './normalize';
import { runTokenCrossCheck } from './tokens-check';

const flag = (name: string): boolean => process.argv.includes(name);
const option = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing env ${name}. See the header of scripts/parity/parity.ts.`);
    process.exit(2);
  }
  return v;
}

const apiBase = (origin: string): string => {
  const o = origin.replace(/\/+$/, '');
  return o.endsWith('/api/v1') ? o : `${o}/api/v1`;
};

const TIMEZONE = process.env['TIMEZONE']?.trim() || 'Asia/Kolkata';
const VERBOSE = flag('--verbose');
const ONLY = option('--only');

interface Reply {
  status: number;
  ms: number;
  body: unknown;
  requestId: string | null;
  contentType: string | null;
}

type Side = 'py' | 'ts';

class Client {
  constructor(
    readonly side: Side,
    private readonly base: string,
    private readonly token: string,
  ) {}

  async call(method: string, path: string, opts: { query?: Record<string, string>; json?: unknown; headers?: Record<string, string>; auth?: boolean } = {}): Promise<Reply> {
    const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : '';
    const headers: Record<string, string> = { accept: 'application/json', ...opts.headers };
    if (opts.auth !== false) headers['authorization'] = `Bearer ${this.token}`;
    if (opts.json !== undefined) headers['content-type'] = 'application/json';
    const started = Date.now();
    const res = await fetch(`${this.base}${path}${qs}`, {
      method,
      headers,
      body: opts.json === undefined ? undefined : JSON.stringify(opts.json),
      signal: AbortSignal.timeout(90_000),
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      /* not JSON (HTML unsubscribe page, ...) */
    }
    return { status: res.status, ms: Date.now() - started, body, requestId: res.headers.get('x-request-id'), contentType: res.headers.get('content-type') };
  }
}

type Verdict = 'OK' | 'WARN' | 'DIFF';
interface Row {
  name: string;
  py: number;
  ts: number;
  pyMs: number;
  tsMs: number;
  verdict: Verdict;
  notes: string[];
}
const rows: Row[] = [];

function describeDiff(d: Diff): string {
  const clip = (v: Json | undefined) => (v === undefined ? '' : JSON.stringify(v).slice(0, 90));
  switch (d.kind) {
    case 'missing_in_ts':
      return `${d.path}: only in PYTHON (${clip(d.py)})`;
    case 'extra_in_ts':
      return `${d.path}: only in TS (${clip(d.ts)})`;
    case 'order':
      return `${d.path}: same items, different order (tie-break)`;
    case 'length':
      return `${d.path}: array length py=${JSON.stringify(d.py)} ts=${JSON.stringify(d.ts)}`;
    default:
      return `${d.path}: py=${clip(d.py)} ts=${clip(d.ts)}`;
  }
}

function record(name: string, py: Reply, ts: Reply, extra: { shapeOnly?: boolean; keysOnly?: boolean; tsOnlyKeys?: readonly string[] } = {}): Row {
  const notes: string[] = [];
  let verdict: Verdict = 'OK';
  const bump = (v: Verdict) => {
    if (v === 'DIFF' || (v === 'WARN' && verdict === 'OK')) verdict = v;
  };
  if (py.status !== ts.status) {
    bump('DIFF');
    notes.push(`status py=${py.status} ts=${ts.status}`);
  }
  if (!ts.requestId) {
    bump('DIFF');
    notes.push('TS response has no X-Request-ID (contract C8)');
  }
  const pyJson = py.contentType?.includes('json') ?? false;
  const tsJson = ts.contentType?.includes('json') ?? false;
  if (pyJson !== tsJson && py.status === ts.status) {
    bump('DIFF');
    notes.push(`content-type py=${py.contentType ?? '-'} ts=${ts.contentType ?? '-'}`);
  }
  if (extra.keysOnly) {
    // `tsOnlyKeys`: additive fields the TS API is allowed to add (agent contract C9: `memory`, `turn_id`).
    const keys = (b: unknown, drop: readonly string[] = []) =>
      b && typeof b === 'object' ? Object.keys(b).filter((k) => !drop.includes(k)).sort().join(',') : typeof b;
    if (keys(py.body) !== keys(ts.body, extra.tsOnlyKeys)) {
      bump('DIFF');
      notes.push(`top-level keys py=[${keys(py.body)}] ts=[${keys(ts.body, extra.tsOnlyKeys)}]`);
    }
  } else if (py.status === ts.status && (pyJson || tsJson)) {
    const a = extra.shapeOnly ? shapeOf(py.body) : normalize(py.body);
    const b = extra.shapeOnly ? shapeOf(ts.body) : normalize(ts.body);
    for (const d of diffJson(a, b)) {
      if (d.kind === 'order') bump('WARN');
      else bump('DIFF');
      notes.push(describeDiff(d));
    }
  } else if (py.status === ts.status && typeof py.body === 'string' && typeof ts.body === 'string' && py.body !== ts.body) {
    bump('WARN');
    notes.push('text bodies differ (not JSON); compare manually');
  }
  const row: Row = { name, py: py.status, ts: ts.status, pyMs: py.ms, tsMs: ts.ms, verdict, notes };
  rows.push(row);
  const mark = verdict === 'OK' ? 'ok  ' : verdict === 'WARN' ? 'warn' : 'DIFF';
  console.log(`${mark}  ${name.padEnd(46)} py ${String(py.status).padEnd(3)} ${String(py.ms).padStart(5)} ms | ts ${String(ts.status).padEnd(3)} ${String(ts.ms).padStart(5)} ms`);
  if (verdict !== 'OK') for (const n of notes.slice(0, VERBOSE ? 200 : 8)) console.log(`        ${n}`);
  if (notes.length > 8 && !VERBOSE && verdict !== 'OK') console.log(`        ... ${notes.length - 8} more (use --verbose)`);
  return row;
}

async function both(py: Client, ts: Client, name: string, method: string, path: string, opts: Parameters<Client['call']>[2] = {}, extra: Parameters<typeof record>[3] = {}) {
  if (ONLY && !name.includes(ONLY)) return null;
  const [a, b] = await Promise.all([
    py.call(method, path, opts).catch((e: unknown) => failedReply(e)),
    ts.call(method, path, opts).catch((e: unknown) => failedReply(e)),
  ]);
  record(name, a, b, extra);
  return { py: a, ts: b };
}

const failedReply = (e: unknown): Reply => ({ status: 0, ms: 0, body: String(e), requestId: null, contentType: null });

/* -------------------------------------------------------------------------------------------------
 * Read-only endpoints
 * ----------------------------------------------------------------------------------------------- */

function monthParts(): { year: number; month: number } {
  const arg = option('--month');
  if (arg && /^\d{4}-\d{2}$/.test(arg)) return { year: Number(arg.slice(0, 4)), month: Number(arg.slice(5)) };
  const now = new Date(new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit' }).format(new Date()) + '-01T00:00:00Z');
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

function previousMonth(m: { year: number; month: number }): { year: number; month: number } {
  return m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 };
}

async function readOnly(py: Client, ts: Client): Promise<void> {
  console.log('\n== Read-only endpoints ==');
  const cur = monthParts();
  const prev = previousMonth(cur);
  const q = (m: { year: number; month: number }) => ({ year: String(m.year), month: String(m.month), timezone: TIMEZONE });

  await both(py, ts, 'GET /health', 'GET', '/health', { auth: false });
  await both(py, ts, 'GET /me', 'GET', '/me');
  await both(py, ts, 'GET /me/settings', 'GET', '/me/settings');
  const cats = await both(py, ts, 'GET /categories', 'GET', '/categories');
  await both(py, ts, 'GET /budget', 'GET', '/budget');
  await both(py, ts, 'GET /budget/categories', 'GET', '/budget/categories');
  for (const filter of ['all', 'unread', 'read']) await both(py, ts, `GET /notifications?filter=${filter}`, 'GET', '/notifications', { query: { filter } });
  await both(py, ts, 'GET /notifications/unread-count', 'GET', '/notifications/unread-count');

  await both(py, ts, 'GET /transactions/home', 'GET', '/transactions/home', { query: { timezone: TIMEZONE } });
  for (const m of [cur, prev]) {
    await both(py, ts, `GET /transactions/month-summary ${m.year}-${m.month}`, 'GET', '/transactions/month-summary', { query: q(m) });
    await both(py, ts, `GET /transactions/month-insights ${m.year}-${m.month}`, 'GET', '/transactions/month-insights', { query: q(m) });
  }
  const list = await both(py, ts, 'GET /transactions (page 1)', 'GET', '/transactions', { query: { limit: '25', timezone: TIMEZONE } });
  await both(py, ts, 'GET /transactions (offset 25)', 'GET', '/transactions', { query: { limit: '25', offset: '25', timezone: TIMEZONE } });
  const from = new Date(Date.UTC(cur.year, cur.month - 1, 1)).toISOString();
  const to = new Date(Date.UTC(cur.year, cur.month, 1)).toISOString();
  await both(py, ts, 'GET /transactions (from/to month)', 'GET', '/transactions', { query: { from, to, limit: '200', timezone: TIMEZONE } });

  const items = ((list?.py.body as { items?: { id?: string; counterparty_normalized?: string; category_id?: string }[] } | null)?.items ?? []);
  const first = items[0];
  if (first?.category_id) await both(py, ts, 'GET /transactions?category_id=', 'GET', '/transactions', { query: { category_id: first.category_id, limit: '50', timezone: TIMEZONE } });
  if (first?.counterparty_normalized) await both(py, ts, 'GET /transactions?payee=', 'GET', '/transactions', { query: { payee: first.counterparty_normalized, limit: '50', timezone: TIMEZONE } });
  if (first?.id) await both(py, ts, 'GET /transactions/{id}', 'GET', `/transactions/${first.id}`);
  else console.log('note  no transactions on this account: /transactions/{id} skipped');

  const catList = Array.isArray(cats?.py.body) ? (cats.py.body as { id: string; is_system?: boolean }[]) : [];
  const cat = catList.find((c) => !c.is_system) ?? catList[0];
  if (cat) await both(py, ts, 'GET /categories/{id}/delete-impact', 'GET', `/categories/${cat.id}/delete-impact`);

  console.log('\n== Validation / auth probes (no writes) ==');
  const missingUuid = randomUUID();
  await both(py, ts, 'GET /me without token -> 401/403', 'GET', '/me', { auth: false }, { keysOnly: true });
  await both(py, ts, 'GET /transactions/home bad timezone', 'GET', '/transactions/home', { query: { timezone: 'Not/AZone' } });
  await both(py, ts, 'GET /transactions/home missing timezone', 'GET', '/transactions/home', {}, { keysOnly: true });
  await both(py, ts, 'GET /transactions/not-a-uuid', 'GET', '/transactions/not-a-uuid', {}, { keysOnly: true });
  await both(py, ts, 'GET /transactions/{unknown uuid} -> 404', 'GET', `/transactions/${missingUuid}`);
  await both(py, ts, 'GET month-summary month=13', 'GET', '/transactions/month-summary', { query: { year: '2026', month: '13', timezone: TIMEZONE } }, { keysOnly: true });
  await both(py, ts, 'GET /notifications?filter=bogus', 'GET', '/notifications', { query: { filter: 'bogus' } }, { keysOnly: true });
}

/* -------------------------------------------------------------------------------------------------
 * Write scenario (test account only)
 * ----------------------------------------------------------------------------------------------- */

async function writes(py: Client, ts: Client): Promise<void> {
  console.log('\n== Write scenario (TEST ACCOUNT): create / update / delete, with cleanup ==');
  const marker = Date.now().toString(36);
  const scrub = (r: Reply, side: Side): Reply => ({ ...r, body: JSON.parse(JSON.stringify(r.body ?? null).replaceAll(`${marker}-${side}`, '<m>').replaceAll(marker, '<m>')) as unknown });
  const run = async (client: Client): Promise<Record<string, Reply>> => {
    const side = client.side;
    const out: Record<string, Reply> = {};
    const keep = (k: string, r: Reply) => (out[k] = scrub(r, side));
    let categoryId: string | null = null;
    let txId: string | null = null;
    const key = `parity-${marker}-${side}-${Date.now()}`;
    const txBody = {
      amount: '12.34',
      type: 'debit',
      counterparty_name: `Parity ${marker}-${side}`,
      counterparty_type: 'merchant',
      note: 'parity run',
      transaction_at: new Date().toISOString(),
    };
    try {
      const created = await client.call('POST', '/categories', { json: { name: `parity-${marker}-${side}`, icon_name: 'Tag', color: '#112233' } });
      keep('category create', created);
      categoryId = (created.body as { id?: string } | null)?.id ?? null;
      if (!categoryId) throw new Error(`category create failed (${created.status})`);
      keep('category patch + budget', await client.call('PATCH', `/categories/${categoryId}`, { json: { budget_amount: '1234.5' } }));
      keep('category patch budget=null', await client.call('PATCH', `/categories/${categoryId}`, { json: { budget_amount: null } }));
      keep('category patch empty body -> 422', await client.call('PATCH', `/categories/${categoryId}`, { json: {} }));
      keep('category budget put', await client.call('PUT', `/budget/categories/${categoryId}`, { json: { monthly_amount: '2000' } }));
      keep('category delete-impact', await client.call('GET', `/categories/${categoryId}/delete-impact`));

      const first = await client.call('POST', '/transactions', { json: { ...txBody, category_id: categoryId }, headers: { 'Idempotency-Key': key } });
      keep('transaction create (idempotency key)', first);
      keep('transaction replay (same key)', await client.call('POST', '/transactions', { json: { ...txBody, category_id: categoryId }, headers: { 'Idempotency-Key': key } }));
      keep('transaction bad idempotency key -> 422', await client.call('POST', '/transactions', { json: txBody, headers: { 'Idempotency-Key': 'x' } }));
      keep('transaction invalid body -> 422', await client.call('POST', '/transactions', { json: { amount: '-1' } }));

      const listed = await client.call('GET', '/transactions', { query: { payee: `Parity ${marker}-${side}`, limit: '10', timezone: TIMEZONE } });
      keep('transaction list by payee', listed);
      txId = (listed.body as { items?: { id?: string }[] } | null)?.items?.[0]?.id ?? null;
      if (txId) {
        keep('transaction patch', await client.call('PATCH', `/transactions/${txId}`, { json: { ...txBody, note: 'parity edited', category_id: categoryId } }));
        keep('transaction detail', await client.call('GET', `/transactions/${txId}`));
        keep('transaction delete', await client.call('DELETE', `/transactions/${txId}`));
        keep('transaction detail after delete -> 404', await client.call('GET', `/transactions/${txId}`));
        txId = null;
      }
      keep('category budget delete', await client.call('DELETE', `/budget/categories/${categoryId}`));
      const token = `ExponentPushToken[parity-${marker}-${side}]`;
      keep('push-token put', await client.call('PUT', '/me/push-token', { json: { token, platform: 'android' } }));
      keep('push-token delete', await client.call('DELETE', '/me/push-token', { json: { token } }));
    } catch (err) {
      out['SCENARIO ERROR'] = failedReply(err);
    } finally {
      // Cleanup, always, best effort.
      if (txId) await client.call('DELETE', `/transactions/${txId}`).catch(() => undefined);
      if (categoryId) {
        await client.call('DELETE', `/budget/categories/${categoryId}`).catch(() => undefined);
        const del = await client.call('DELETE', `/categories/${categoryId}`).catch((e: unknown) => failedReply(e));
        keep('category delete (cleanup)', del);
      }
    }
    return out;
  };
  // Sequential per backend: the account is shared, so they must not interleave.
  const pyOut = await run(py);
  const tsOut = await run(ts);
  for (const step of new Set([...Object.keys(pyOut), ...Object.keys(tsOut)])) {
    if (ONLY && !step.includes(ONLY)) continue;
    const a = pyOut[step] ?? failedReply('step missing on python');
    const b = tsOut[step] ?? failedReply('step missing on ts');
    record(`WRITE ${step}`, a, b, { shapeOnly: true });
  }
}

async function agent(py: Client, ts: Client): Promise<void> {
  console.log('\n== Agent chat (LLM call on both backends) ==');
  const body = { content: 'How much did I spend this month?', timezone: TIMEZONE, history: [] };
  const [a, b] = await Promise.all([py.call('POST', '/agent/chat', { json: body }), ts.call('POST', '/agent/chat', { json: body })]);
  // C9: JSON mode keeps the C5 ChatResponse and only ADDS `memory` and `turn_id` (the agent is a tool-calling loop now;
  // wording and charts differ by design, so only the top-level shape is compared).
  record('POST /agent/chat (top-level keys only; TS adds memory + turn_id)', a, b, { keysOnly: true, tsOnlyKeys: ['memory', 'turn_id'] });
}

/* ------------------------------------------------------------------------------------------------- */

async function main(): Promise<void> {
  if (flag('--tokens') && !(await runTokenCrossCheck())) process.exitCode = 1;
  if (flag('--tokens-only')) return;

  const token = need('ACCESS_TOKEN');
  const py = new Client('py', apiBase(need('PY_BASE_URL')), token);
  const ts = new Client('ts', apiBase(need('TS_BASE_URL')), token);
  console.log(`Python: ${apiBase(need('PY_BASE_URL'))}\nTS:     ${apiBase(need('TS_BASE_URL'))}\nTimezone: ${TIMEZONE}`);

  await readOnly(py, ts);
  if (flag('--include-writes')) await writes(py, ts);
  if (flag('--include-agent')) await agent(py, ts);

  const counts = { OK: 0, WARN: 0, DIFF: 0 };
  for (const r of rows) counts[r.verdict]++;
  const slower = rows.filter((r) => r.tsMs > r.pyMs * 2 && r.tsMs > 300);
  console.log(`\n== Summary ==\n${rows.length} comparisons: ${counts.OK} identical (after normalisation), ${counts.WARN} warnings (ordering / text), ${counts.DIFF} DIFFERENCES`);
  if (slower.length) console.log(`TS more than 2x slower than Python on: ${slower.map((r) => `${r.name} (${r.tsMs} vs ${r.pyMs} ms)`).join('; ')}`);
  const out = option('--json');
  if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
  if (counts.DIFF) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(2);
});
