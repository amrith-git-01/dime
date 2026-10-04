/**
 * Agent eval runner. Sends every golden question to a running API (a local `wrangler dev` or a deployed
 * Worker, with a REAL DeepSeek key behind it) as the fixture user and reports:
 *
 *   tool-selection accuracy, numeric accuracy, clarification accuracy, tool steps per turn,
 *   latency p50 / p95, tokens per turn (with prefix-cache hits) and cost per turn
 *
 * as a table on stdout plus `reports/<timestamp>.json` and `reports/<timestamp>.md`.
 *
 *   npx tsx evals/run.ts --url http://127.0.0.1:8787 --jwt-secret <SUPABASE_JWT_SECRET> --supabase-url <SUPABASE_URL>
 *   npx tsx evals/run.ts --url https://dime-api-staging.<sub>.workers.dev --token <access token of the fixture user>
 *
 * Options (each also as an EVAL_* environment variable):
 *   --url            API origin                                   EVAL_BASE_URL       (default http://127.0.0.1:8787)
 *   --token          access token of the fixture user             EVAL_ACCESS_TOKEN
 *   --jwt-secret     legacy HS256 secret: mints the token itself  EVAL_JWT_SECRET     (with --supabase-url / EVAL_SUPABASE_URL)
 *   --mode           sse (default, also measures time to first token) | json
 *   --filter <text>  only conversations whose id or a question contains the text
 *   --limit <n>      first n conversations
 *   --rate <n>       max requests per minute (default 8; the AI limiter allows 10 per user per minute and a 429 is
 *                    retried after its Retry-After anyway)
 *   --out <dir>      report directory (default evals/reports)
 *   --min-tool <p> / --min-numeric <p>   exit 1 when an accuracy (0..1) is below it (CI gate)
 *
 * Prices for the cost estimate (USD per million tokens): EVAL_PRICE_INPUT_HIT, EVAL_PRICE_INPUT_MISS,
 * EVAL_PRICE_OUTPUT. The defaults are DeepSeek's published rates at the time of writing: check them.
 *
 * The API reports tools, model calls and tokens in a `debug` object when asked with `X-Agent-Debug: 1`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SignJWT } from 'jose';

import { extractMentions, mentionMatches } from '../src/features/agent/verify';
import { FIXTURE_USER_ID } from './fixture';

const here = dirname(fileURLToPath(import.meta.url));

/* ----------------------------------------------------------------------------------------------
 * Options
 * -------------------------------------------------------------------------------------------- */

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const opt = (name: string, env: string): string | undefined => flag(name) ?? process.env[env];

const baseUrl = (opt('url', 'EVAL_BASE_URL') ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
const mode = (opt('mode', 'EVAL_MODE') ?? 'sse') === 'json' ? 'json' : 'sse';
const filter = flag('filter');
const limit = flag('limit') ? Number(flag('limit')) : undefined;
const ratePerMinute = Number(flag('rate') ?? process.env['EVAL_RATE'] ?? 8);
const outDir = resolve(flag('out') ?? join(here, 'reports'));
const minTool = flag('min-tool') ? Number(flag('min-tool')) : undefined;
const minNumeric = flag('min-numeric') ? Number(flag('min-numeric')) : undefined;
const timezone = 'Asia/Kolkata';
const PRICE = {
  hit: Number(process.env['EVAL_PRICE_INPUT_HIT'] ?? 0.028),
  miss: Number(process.env['EVAL_PRICE_INPUT_MISS'] ?? 0.28),
  out: Number(process.env['EVAL_PRICE_OUTPUT'] ?? 0.42),
};

async function accessToken(): Promise<string> {
  const given = opt('token', 'EVAL_ACCESS_TOKEN');
  if (given) return given;
  const secret = opt('jwt-secret', 'EVAL_JWT_SECRET');
  const supabaseUrl = opt('supabase-url', 'EVAL_SUPABASE_URL');
  if (!secret || !supabaseUrl) {
    console.error('Give --token (or EVAL_ACCESS_TOKEN), or --jwt-secret and --supabase-url to mint one for the fixture user.');
    process.exit(2);
  }
  return new SignJWT({ role: 'authenticated', email: 'agent-eval@dime.test' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(FIXTURE_USER_ID)
    .setAudience('authenticated')
    .setIssuer(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1`)
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(secret));
}

/* ----------------------------------------------------------------------------------------------
 * Golden file
 * -------------------------------------------------------------------------------------------- */

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
  expect_no_tools?: boolean;
  relative?: boolean;
  note?: string;
}
interface Conversation {
  id: string;
  turns: Turn[];
}

function loadGolden(): Conversation[] {
  let all = readFileSync(join(here, 'golden.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Conversation);
  if (filter) all = all.filter((c) => c.id.includes(filter) || c.turns.some((t) => t.question.toLowerCase().includes(filter.toLowerCase())));
  return limit ? all.slice(0, limit) : all;
}

/* ----------------------------------------------------------------------------------------------
 * Talking to the API
 * -------------------------------------------------------------------------------------------- */

interface Debug {
  steps: { tool: string; ms: number; rows: number; ok: boolean }[];
  tool_steps: number;
  llm: { model: string; ms: number; prompt_tokens: number; cache_hit_tokens: number; completion_tokens: number }[];
  verified: string;
  outcome: string;
  tokens: { promptTokens: number; completionTokens: number; cacheHitTokens: number };
}
interface Reply {
  answer: string | null;
  error: { code: string; message: string } | null;
  memory: string;
  debug: Debug | null;
  ms: number;
  firstTokenMs: number | null;
  httpStatus: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One request every 60/rate seconds across all workers. */
let nextSlot = 0;
async function paced(): Promise<void> {
  const gap = 60_000 / Math.max(ratePerMinute, 0.1);
  const at = Math.max(Date.now(), nextSlot);
  nextSlot = at + gap;
  if (at > Date.now()) await sleep(at - Date.now());
}

async function ask(token: string, content: string, history: { role: string; content: string }[], memory: string | null): Promise<Reply> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await paced();
    const started = Date.now();
    const res = await fetch(`${baseUrl}/api/v1/agent/chat`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-agent-debug': '1',
        ...(mode === 'sse' ? { accept: 'text/event-stream' } : {}),
      },
      body: JSON.stringify({ content, timezone, history, ...(memory ? { memory } : {}) }),
    });
    if (res.status === 429) {
      await sleep((Number(res.headers.get('retry-after')) || 10) * 1000);
      continue;
    }
    if (mode === 'json' || !res.headers.get('content-type')?.includes('text/event-stream')) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return fromBody(body, res.status, Date.now() - started, null);
    }
    return fromStream(res, started);
  }
  return { answer: null, error: { code: 'rate_limited', message: 'still 429 after retries' }, memory: '', debug: null, ms: 0, firstTokenMs: null, httpStatus: 429 };
}

function fromBody(body: Record<string, unknown>, httpStatus: number, ms: number, firstTokenMs: number | null): Reply {
  const err = body['error'] as { code?: string; message?: string } | undefined;
  return {
    answer: typeof body['answer'] === 'string' ? body['answer'] : null,
    error: err ? { code: err.code ?? 'error', message: err.message ?? '' } : httpStatus >= 400 ? { code: `http_${httpStatus}`, message: JSON.stringify(body).slice(0, 200) } : null,
    memory: typeof body['memory'] === 'string' ? body['memory'] : '',
    debug: (body['debug'] as Debug | undefined) ?? null,
    ms,
    firstTokenMs,
    httpStatus,
  };
}

async function fromStream(res: Response, started: number): Promise<Reply> {
  let firstTokenMs: number | null = null;
  let final: Record<string, unknown> = {};
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (block: string) => {
    const event = /^event:\s*(.+)$/m.exec(block)?.[1]?.trim();
    const data = [...block.matchAll(/^data:\s?(.*)$/gm)].map((m) => m[1]).join('\n');
    if (!event || !data) return;
    if (event === 'delta' && firstTokenMs === null) firstTokenMs = Date.now() - started;
    if (event === 'final' || event === 'error') final = event === 'error' ? { error: JSON.parse(data) } : (JSON.parse(data) as Record<string, unknown>);
  };
  for (;;) {
    const chunk = await reader?.read();
    if (!chunk || chunk.done) break;
    buffer += decoder.decode(chunk.value as Uint8Array, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      handle(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 2);
    }
  }
  if (buffer.trim()) handle(buffer);
  return fromBody(final, res.status, Date.now() - started, firstTokenMs);
}

/* ----------------------------------------------------------------------------------------------
 * Scoring
 * -------------------------------------------------------------------------------------------- */

/** A fact is found when some number of the answer equals it up to the rounding its formatting allows. */
const factFound = (fact: Fact, answer: string): boolean =>
  extractMentions(answer).some((m) => {
    if (fact.k === 'count') return m.value === fact.v;
    return m.percent === (fact.k === 'percent') && mentionMatches(m, fact.v);
  });

interface TurnResult {
  conversation: string;
  index: number;
  question: string;
  answer: string | null;
  tools: string[];
  /** null = not scored for this turn. */
  toolOk: boolean | null;
  numericOk: boolean | null;
  missingFacts: Fact[];
  clarificationOk: boolean | null;
  error: string | null;
  outcome: string | null;
  verified: string | null;
  toolSteps: number | null;
  ms: number;
  firstTokenMs: number | null;
  tokens: { prompt: number; completion: number; cacheHit: number } | null;
  costUsd: number | null;
  note: string | null;
}

const hasAll = (called: Set<string>, needed: readonly string[]) => needed.every((t) => called.has(t));

function score(conv: string, index: number, turn: Turn, reply: Reply): TurnResult {
  const called = new Set((reply.debug?.steps ?? []).map((s) => s.tool));
  const answer = reply.answer ?? '';
  let toolOk: boolean | null = null;
  if (turn.expect_no_tools) toolOk = called.size === 0;
  else if (turn.tools && turn.tools.length > 0) toolOk = [turn.tools, ...(turn.alt_tools ?? [])].some((set) => hasAll(called, set));

  const missingFacts = turn.facts && !turn.relative && reply.answer ? turn.facts.filter((f) => !factFound(f, answer)) : [];
  const numericOk = turn.facts?.length && !turn.relative ? reply.answer !== null && missingFacts.length === 0 : null;

  let clarificationOk: boolean | null = null;
  if (turn.expect_clarification) {
    const options = turn.clarify_options ?? [];
    clarificationOk = answer.includes('?') && options.every((o) => answer.toLowerCase().includes(o.toLowerCase())) && called.size === 0;
  }

  const t = reply.debug?.tokens;
  const costUsd = t ? ((t.promptTokens - t.cacheHitTokens) * PRICE.miss + t.cacheHitTokens * PRICE.hit + t.completionTokens * PRICE.out) / 1e6 : null;
  return {
    conversation: conv,
    index,
    question: turn.question,
    answer: reply.answer,
    tools: [...called],
    toolOk,
    numericOk,
    missingFacts,
    clarificationOk,
    error: reply.error ? `${reply.error.code}: ${reply.error.message}` : null,
    outcome: reply.debug?.outcome ?? null,
    verified: reply.debug?.verified ?? null,
    toolSteps: reply.debug?.tool_steps ?? null,
    ms: reply.ms,
    firstTokenMs: reply.firstTokenMs,
    tokens: t ? { prompt: t.promptTokens, completion: t.completionTokens, cacheHit: t.cacheHitTokens } : null,
    costUsd,
    note: turn.note ?? null,
  };
}

/* ----------------------------------------------------------------------------------------------
 * Run and report
 * -------------------------------------------------------------------------------------------- */

const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}% (${n}/${d})`);
const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);
const percentile = (xs: number[], p: number): number => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
};
const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

async function main(): Promise<void> {
  const token = await accessToken();
  const golden = loadGolden();
  const results: TurnResult[] = [];
  const started = new Date();
  console.log(`Running ${golden.length} conversations (${golden.reduce((n, c) => n + c.turns.length, 0)} turns) against ${baseUrl} in ${mode} mode at <= ${ratePerMinute} requests/min`);

  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const conv = golden[cursor++];
      if (!conv) return;
      const history: { role: string; content: string }[] = [];
      let memory: string | null = null;
      for (const [i, turn] of conv.turns.entries()) {
        const reply = await ask(token, turn.question, history, memory);
        const r = score(conv.id, i + 1, turn, reply);
        results.push(r);
        const flag = r.error ? 'ERR ' : r.toolOk === false || r.numericOk === false || r.clarificationOk === false ? 'FAIL' : 'ok  ';
        console.log(`${flag} ${conv.id}.${i + 1} ${r.ms}ms [${r.tools.join(',') || '-'}] ${turn.question.slice(0, 70)}`);
        history.push({ role: 'user', content: turn.question });
        if (reply.answer) history.push({ role: 'assistant', content: reply.answer });
        memory = reply.memory || memory;
      }
    }
  };
  // Conversations run one after another: the per-user rate limit makes parallelism pointless, and follow-ups need their memory.
  await worker();

  const scored = (f: (r: TurnResult) => boolean | null) => results.filter((r) => f(r) !== null);
  const toolRows = scored((r) => r.toolOk);
  const numRows = scored((r) => r.numericOk);
  const clarRows = scored((r) => r.clarificationOk);
  const good = results.filter((r) => !r.error);
  const summary = {
    started: started.toISOString(),
    baseUrl,
    mode,
    turns: results.length,
    errors: results.filter((r) => r.error).length,
    toolAccuracy: ratio(toolRows.filter((r) => r.toolOk).length, toolRows.length),
    numericAccuracy: ratio(numRows.filter((r) => r.numericOk).length, numRows.length),
    clarificationAccuracy: ratio(clarRows.filter((r) => r.clarificationOk).length, clarRows.length),
    templateFallbacks: results.filter((r) => r.outcome === 'template').length,
    regenerated: results.filter((r) => r.verified === 'regenerated').length,
    toolStepsPerTurn: mean(good.map((r) => r.toolSteps ?? 0)),
    latencyMs: { p50: percentile(good.map((r) => r.ms), 50), p95: percentile(good.map((r) => r.ms), 95) },
    firstTokenMs: { p50: percentile(good.flatMap((r) => (r.firstTokenMs === null ? [] : [r.firstTokenMs])), 50) },
    tokensPerTurn: {
      prompt: mean(good.map((r) => r.tokens?.prompt ?? 0)),
      cacheHit: mean(good.map((r) => r.tokens?.cacheHit ?? 0)),
      completion: mean(good.map((r) => r.tokens?.completion ?? 0)),
    },
    costUsdPerTurn: mean(good.map((r) => r.costUsd ?? 0)),
    prices: PRICE,
  };

  const failing = results.filter((r) => r.error || r.toolOk === false || r.numericOk === false || r.clarificationOk === false);
  const markdown = [
    `# Agent eval report`,
    ``,
    `${summary.started} against \`${baseUrl}\` (${mode} mode)`,
    ``,
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Turns | ${summary.turns} (errors: ${summary.errors}) |`,
    `| Tool selection accuracy | ${pct(toolRows.filter((r) => r.toolOk).length, toolRows.length)} |`,
    `| Numeric accuracy | ${pct(numRows.filter((r) => r.numericOk).length, numRows.length)} |`,
    `| Clarification accuracy | ${pct(clarRows.filter((r) => r.clarificationOk).length, clarRows.length)} |`,
    `| Template fallbacks / regenerations | ${summary.templateFallbacks} / ${summary.regenerated} |`,
    `| Tool steps per turn | ${summary.toolStepsPerTurn.toFixed(2)} |`,
    `| Latency p50 / p95 | ${summary.latencyMs.p50} ms / ${summary.latencyMs.p95} ms |`,
    `| Time to first token p50 | ${mode === 'sse' ? `${summary.firstTokenMs.p50} ms` : 'n/a (json mode)'} |`,
    `| Tokens per turn (prompt / cached / completion) | ${summary.tokensPerTurn.prompt.toFixed(0)} / ${summary.tokensPerTurn.cacheHit.toFixed(0)} / ${summary.tokensPerTurn.completion.toFixed(0)} |`,
    `| Cost per turn | $${summary.costUsdPerTurn.toFixed(5)} (hit ${PRICE.hit}, miss ${PRICE.miss}, output ${PRICE.out} USD per 1M tokens) |`,
    ``,
    `## Failures (${failing.length})`,
    ``,
    ...failing.map((r) => {
      const why = [r.error ? `error ${r.error}` : '', r.toolOk === false ? `tools [${r.tools.join(', ')}]` : '', r.numericOk === false ? `missing ${r.missingFacts.map((f) => `${f.k} ${f.v}`).join(', ')}` : '', r.clarificationOk === false ? 'clarification' : ''].filter(Boolean).join('; ');
      return `- **${r.conversation}.${r.index}** ${r.question}\n  - ${why}\n  - answer: ${(r.answer ?? '').replace(/\s+/g, ' ').slice(0, 240)}`;
    }),
    ``,
  ].join('\n');

  mkdirSync(outDir, { recursive: true });
  const stamp = started.toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify({ summary, results }, null, 2));
  writeFileSync(join(outDir, `${stamp}.md`), markdown);
  console.log(`\n${markdown.split('## Failures')[0]}`);
  console.log(`Reports: ${join(outDir, `${stamp}.json`)} and .md`);

  const failed =
    (minTool !== undefined && (summary.toolAccuracy ?? 0) < minTool) || (minNumeric !== undefined && (summary.numericAccuracy ?? 0) < minNumeric);
  if (failed) {
    console.error('Accuracy is below the required minimum.');
    process.exit(1);
  }
}

await main();
