import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import type { AppBindings, Bindings } from '../src/core/env';
import { onError } from '../src/core/errors';
import { agentErrorBody, createAgentRoutes } from '../src/features/agent/routes';
import { TurnTimeoutError } from '../src/features/agent/service';
import { verifyMemory } from '../src/features/agent/memory';
import { PermanentAiError, TransientAiError } from '../src/features/ai/errors';
import { JUNE_RESULT, JUNE_SQL, NOW, SECRET, fakeQueries } from './agent-fixtures';
import { USER_ID, makeCtx, makeEnv, signToken } from './helpers';
import { failingOn, oneRow, rowsOf, seedUser, testDb } from './db';
import { json, useSupabaseStub } from './supabase-stub';

const stub = useSupabaseStub();

const envWith = (extra: Record<string, unknown> = {}): Bindings =>
  ({ ...makeEnv({ DEEPSEEK_API_KEY: 'test-deepseek-key', AGENT_MEMORY_SECRET: SECRET }), AI_LIMITER: undefined, WRITE_LIMITER: undefined, ...extra }) as unknown as Bindings;

interface Call {
  method?: string;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  token?: string | false;
  env?: Bindings;
  db?: ReturnType<typeof fakeQueries> | null;
  ctx?: ExecutionContext;
}

/** The real agent router (auth, limits, validation) over canned tool queries and the stubbed network. */
async function call(path: string, opts: Call = {}): Promise<Response> {
  const app = new Hono<AppBindings>();
  app.onError(onError);
  const db = opts.db === undefined ? fakeQueries({ run_sql: JUNE_RESULT }) : opts.db;
  app.route('/api/v1/agent', createAgentRoutes({ ...(db ? { queries: db.queries } : {}), now: () => NOW }));
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.token !== false) headers['Authorization'] = `Bearer ${opts.token ?? (await signToken({ sub: USER_ID }))}`;
  let body = opts.body;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers['content-type'] = 'application/json';
  }
  return app.request(`/api/v1/agent${path}`, { method: opts.method ?? 'POST', headers, body }, opts.env ?? envWith(), opts.ctx);
}

const chat = (content: string, opts: Call & { accept?: string; extra?: Record<string, unknown> } = {}) =>
  call('/chat', { ...opts, headers: { ...(opts.accept ? { accept: opts.accept } : {}), ...opts.headers }, json: { content, timezone: 'Asia/Kolkata', ...opts.extra } });

interface DeepSeekStep {
  content?: string;
  calls?: { name: string; args: unknown }[];
}

/** DeepSeek stand-in: answers non-stream requests with JSON and stream requests with SSE chunks. */
function deepseek(steps: DeepSeekStep[]) {
  let n = 0;
  stub.on('POST', '/chat/completions', (c) => {
    const body = c.body as { stream?: boolean };
    const step = steps[Math.min(n++, steps.length - 1)] ?? {};
    const tool_calls = step.calls?.map((t, i) => ({ index: i, id: `call_${i}`, type: 'function', function: { name: t.name, arguments: JSON.stringify(t.args) } }));
    const usage = { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 60 };
    if (!body.stream) return json({ choices: [{ message: { content: step.content ?? null, tool_calls }, finish_reason: tool_calls ? 'tool_calls' : 'stop' }], usage });
    const chunks: unknown[] = [];
    if (tool_calls) chunks.push({ choices: [{ delta: { tool_calls } }] });
    else for (const piece of (step.content ?? '').match(/.{1,10}/gs) ?? []) chunks.push({ choices: [{ delta: { content: piece } }] });
    chunks.push({ choices: [{ delta: {}, finish_reason: tool_calls ? 'tool_calls' : 'stop' }] }, { choices: [], usage });
    return new Response(chunks.map((ch) => `data: ${JSON.stringify(ch)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  });
}

const SPENT_JUNE: DeepSeekStep[] = [{ calls: [{ name: 'run_sql', args: JUNE_SQL }] }, { content: 'You spent **₹18,388.50** in June 2026.' }];

async function sseEvents(res: Response): Promise<{ event: string; data: Record<string, unknown> }[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find((l) => l.startsWith('event:'))?.slice(6).trim() ?? '';
      const data = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      return { event, data: JSON.parse(data) as Record<string, unknown> };
    });
}

describe('POST /agent/chat: request handling', () => {
  it('401 without a token', async () => {
    expect((await call('/chat', { json: { content: 'hi' }, token: false })).status).toBe(401);
    expect(stub.calls).toHaveLength(0);
  });

  it('422 for an invalid body (FastAPI shape), including a too-long memory token', async () => {
    const missing = await call('/chat', { json: {} });
    expect(missing.status).toBe(422);
    expect(await missing.json()).toEqual({ detail: [{ type: 'missing', loc: ['body', 'content'], msg: 'Field required' }] });
    expect((await call('/chat', { json: { content: '' } })).status).toBe(422);
    expect((await call('/chat', { json: { content: 'hi', history: [{ role: 'system', content: 'x' }] } })).status).toBe(422);
    expect((await call('/chat', { json: { content: 'x'.repeat(4001) } })).status).toBe(422);
    expect((await call('/chat', { json: { content: 'hi', memory: 'm'.repeat(5000) } })).status).toBe(422);
    expect(stub.calls).toHaveLength(0);
  });

  it('400 for an unknown timezone, before anything else happens', async () => {
    const res = await call('/chat', { json: { content: 'hi', timezone: 'Mars/Base' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "Invalid timezone: 'Mars/Base'" });
    expect(stub.calls).toHaveLength(0);
  });

  it('413 for an oversized body and 429 when the AI limiter rejects', async () => {
    const big = await call('/chat', { json: { content: 'hi', history: [], pad: 'x'.repeat(1024 * 1024) } });
    expect(big.status).toBe(413);
    const limited = await chat('hi', { env: envWith({ AI_LIMITER: { limit: () => Promise.resolve({ success: false }) } }) });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('10');
  });
});

describe('POST /agent/chat: JSON mode (compatible with C5, plus memory)', () => {
  it('returns the ChatResponse shape plus memory and turn_id, and records the usage afterwards', async () => {
    deepseek(SPENT_JUNE);
    const { ctx, flush } = makeCtx();
    const db = fakeQueries({ run_sql: JUNE_RESULT });
    const res = await chat('How much did I spend in June 2026?', { ctx, db });
    await flush();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json<{ answer: string; blocks: unknown[]; deep_link: unknown; memory: string; turn_id: string }>();
    expect(Object.keys(body).sort()).toEqual(['answer', 'blocks', 'deep_link', 'memory', 'turn_id']);
    expect(body.answer).toBe('You spent **₹18,388.50** in June 2026.');
    expect(body.blocks).toEqual([]); // no chart was asked for
    expect(body.deep_link).toBeNull();
    expect(body.turn_id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await verifyMemory(SECRET, body.memory, USER_ID, NOW))?.last_tools).toEqual(['run_sql']);

    // JSON mode never streams.
    const llm = stub.find('POST', '/chat/completions');
    expect(llm).toHaveLength(2);
    expect((llm[0]?.body as { stream?: boolean }).stream).toBeUndefined();
    expect(llm[0]?.headers.get('authorization')).toBe('Bearer test-deepseek-key');
    // Tokens of both model calls were recorded for the user, for the UTC day.
    expect(await rowsOf('agent_usage')).toEqual([
      expect.objectContaining({ user_id: USER_ID, day: '2026-10-05', prompt_tokens: 200, completion_tokens: 40, turns: 1 }),
    ]);
    expect(db.calls().map((c) => c.name)).toEqual(['run_sql']);
  });

  it('adds a debug object (tools, model calls, tokens) only when X-Agent-Debug: 1 is sent (evals)', async () => {
    deepseek([...SPENT_JUNE, ...SPENT_JUNE, ...SPENT_JUNE]); // three turns, two model calls each
    const plain = await (await chat('How much did I spend in June 2026?')).json<Record<string, unknown>>();
    expect(plain['debug']).toBeUndefined();

    const body = await (await chat('How much did I spend in June 2026?', { headers: { 'x-agent-debug': '1' } })).json<{ debug: Record<string, unknown> }>();
    expect(body.debug).toMatchObject({
      tool_steps: 1,
      steps: [{ tool: 'run_sql', ok: true, sql_chars: JUNE_SQL.sql.length }],
      verified: 'pass',
      outcome: 'ok',
      tokens: { promptTokens: 200, completionTokens: 40, cacheHitTokens: 120 },
    });
    expect(body.debug['llm']).toHaveLength(2);

    const events = await sseEvents(await chat('How much did I spend in June 2026?', { accept: 'text/event-stream', headers: { 'x-agent-debug': '1' } }));
    expect((events.at(-1)?.data as { debug?: { tool_steps: number } }).debug?.tool_steps).toBe(1);
  });

  it('passes the signed memory through to the next turn', async () => {
    deepseek([{ content: 'Hello!' }]);
    const first = await (await chat('Hi there', { db: null })).json<{ memory: string }>();
    expect(first.memory).not.toBe('');
    const second = await chat('and now?', { db: null, extra: { memory: first.memory } });
    expect(second.status).toBe(200);
    const prompt = JSON.stringify((stub.find('POST', '/chat/completions').at(-1)?.body as { messages: unknown[] }).messages);
    expect(prompt).toContain('Memory from the previous turn');
  });

  it('C5: a failing model is HTTP 200 with {"error": {code, message}} and no provider detail', async () => {
    stub.on('POST', '/chat/completions', () => json({ error: { message: 'secret provider detail' } }, { status: 500 }));
    const res = await chat('hello', { db: null });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'assistant_busy', message: 'The assistant is busy right now. Please try again in a moment.' } });
    expect(JSON.stringify(body)).not.toMatch(/secret|deepseek|500/i);
  });

  it("a failing database query is the tool's error, not the turn's: the model still answers", async () => {
    deepseek([{ calls: [{ name: 'run_sql', args: JUNE_SQL }] }, { content: 'I could not load that right now.' }]);
    const db = fakeQueries({}, { fail: { run_sql: new Error('D1_ERROR: unavailable') } });
    const res = await chat('How much did I spend in June 2026?', { db });
    expect(res.status).toBe(200);
    expect((await res.json<{ answer: string }>()).answer).toBe('I could not load that right now.');
  });
});

describe('POST /agent/chat: SSE mode', () => {
  it('streams step, then delta events, then a final event with the authoritative answer', async () => {
    deepseek(SPENT_JUNE);
    const { ctx, flush } = makeCtx();
    const res = await chat('How much did I spend in June 2026?', { accept: 'text/event-stream', ctx });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events = await sseEvents(res);
    await flush();

    const names = events.map((e) => e.event);
    expect(names[0]).toBe('step');
    expect(names.at(-1)).toBe('final');
    expect(names.slice(1, -1).every((n) => n === 'delta')).toBe(true);
    expect(names.filter((n) => n === 'delta').length).toBeGreaterThan(1);
    expect(events[0]?.data).toEqual({ tool: 'run_sql', label: 'Totalling June' });

    const deltas = events.filter((e) => e.event === 'delta').map((e) => String(e.data['text'])).join('');
    const final = events.at(-1)?.data as { answer: string; memory: string; turn_id: string; blocks: unknown[]; deep_link: unknown };
    expect(final.answer).toBe('You spent **₹18,388.50** in June 2026.');
    expect(deltas).toBe(final.answer);
    expect(final.turn_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(final.memory).toMatch(/\./);
    expect(final.blocks).toEqual([]);
    // Stream mode asks the provider for a stream with usage.
    expect(stub.find('POST', '/chat/completions')[0]?.body).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    expect(await rowsOf('agent_usage')).toEqual([expect.objectContaining({ prompt_tokens: 200, completion_tokens: 40, turns: 1 })]);
  });

  it('final.answer replaces streamed text that failed numeric verification', async () => {
    deepseek([{ calls: [{ name: 'run_sql', args: JUNE_SQL }] }, { content: 'You spent ₹99,999 in June.' }, { content: 'You spent ₹18,388.50 in June.' }]);
    const events = await sseEvents(await chat('How much did I spend in June 2026?', { accept: 'text/event-stream' }));
    const streamed = events.filter((e) => e.event === 'delta').map((e) => String(e.data['text'])).join('');
    expect(streamed).toBe('You spent ₹99,999 in June.');
    expect((events.at(-1)?.data as { answer: string }).answer).toBe('You spent ₹18,388.50 in June.');
  });

  it('ends with an error event (C5 payload) when the model fails', async () => {
    stub.on('POST', '/chat/completions', () => json({}, { status: 503 }));
    const events = await sseEvents(await chat('hello', { accept: 'text/event-stream', db: null }));
    expect(events.map((e) => e.event)).toEqual(['error']);
    expect(events[0]?.data).toEqual({ code: 'assistant_busy', message: 'The assistant is busy right now. Please try again in a moment.' });
  });

  it('a clarification streams just the final event, with no model call', async () => {
    const db = fakeQueries({
      resolve_entities: {
        matches: [
          { phrase: 'swigy', type: 'payee', id: 'swiggy', name: 'Swiggy', score: 0.62, similarity: 0.4, txn_count: 3 },
          { phrase: 'swigy', type: 'payee', id: 'swiggy instamart', name: 'Swiggy Instamart', score: 0.62, similarity: 0.3, txn_count: 3 },
        ],
      },
    });
    const events = await sseEvents(await chat('spend at swigy in June', { accept: 'text/event-stream', db }));
    expect(events.map((e) => e.event)).toEqual(['final']);
    expect((events[0]?.data as { answer: string }).answer).toContain('Did you mean **Swiggy** or **Swiggy Instamart**?');
    expect(stub.find('POST', '/chat/completions')).toHaveLength(0);
    // No tokens to record, but the question itself was counted.
    expect(await rowsOf('agent_usage')).toEqual([expect.objectContaining({ prompt_tokens: 0, completion_tokens: 0, turns: 1 })]);
  });
});

describe('kill switch and daily budget', () => {
  it('AGENT_ENABLED=false answers agent_disabled (JSON and SSE) without touching anything', async () => {
    const env = envWith({ AGENT_ENABLED: 'false' });
    const res = await chat('hi', { env });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ error: { code: 'agent_disabled', message: 'The assistant is switched off right now. Please try again later.' } });
    const events = await sseEvents(await chat('hi', { env, accept: 'text/event-stream' }));
    expect(events).toEqual([{ event: 'error', data: { code: 'agent_disabled', message: 'The assistant is switched off right now. Please try again later.' } }]);
    expect(stub.calls).toHaveLength(0);
  });

  it('answers daily_limit once the user has used the daily token budget', async () => {
    const usage = (user: string, day: string, prompt: number, completion: number) =>
      testDb().prepare('INSERT INTO agent_usage (user_id, day, prompt_tokens, completion_tokens, turns) VALUES (?, ?, ?, ?, 1)').bind(user, day, prompt, completion).run();
    await usage(USER_ID, '2026-10-05', 150_000, 50_000);
    // Other days and other users do not count towards today's budget.
    await seedUser('99999999-9999-9999-9999-999999999999');
    await usage(USER_ID, '2026-10-04', 1, 1);
    await usage('99999999-9999-9999-9999-999999999999', '2026-10-05', 1, 1);
    const res = await chat('hi', { db: null });
    expect(await res.json()).toEqual({ error: { code: 'daily_limit', message: "You've reached today's assistant limit. It resets tomorrow." } });
    expect(stub.find('POST', '/chat/completions')).toHaveLength(0);
    const events = await sseEvents(await chat('hi', { db: null, accept: 'text/event-stream' }));
    expect(events[0]).toMatchObject({ event: 'error', data: { code: 'daily_limit' } });
  });

  it('respects a configured budget and lets the turn through just below it', async () => {
    deepseek([{ content: 'Hello!' }]);
    await testDb().prepare("INSERT INTO agent_usage (user_id, day, prompt_tokens, completion_tokens, turns) VALUES (?, '2026-10-05', 600, 300, 1)").bind(USER_ID).run();
    expect((await (await chat('hi', { db: null, env: envWith({ AGENT_DAILY_TOKEN_BUDGET: '1000' }) })).json<{ answer?: string }>()).answer).toBe('Hello!');
    expect(await (await chat('hi', { db: null, env: envWith({ AGENT_DAILY_TOKEN_BUDGET: '900' }) })).json()).toMatchObject({ error: { code: 'daily_limit' } });
  });

  it('the sixth question of the UTC day answers 429 (Retry-After to UTC midnight) without a model call', async () => {
    deepseek([{ content: 'Hello!' }]);
    for (let i = 0; i < 5; i++) expect((await (await chat('hi', { db: null })).json<{ answer?: string }>()).answer).toBe('Hello!');
    const llmCalls = stub.find('POST', '/chat/completions').length;

    const res = await chat('hi', { db: null });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('70200'); // NOW is 04:30 UTC
    expect(await res.json()).toEqual({ error: { code: 'daily_limit', message: "You've used today's 5 questions. Try again tomorrow." } });
    expect((await chat('hi', { db: null, accept: 'text/event-stream' })).status).toBe(429);
    expect(stub.find('POST', '/chat/completions')).toHaveLength(llmCalls);
    expect(await rowsOf('agent_usage')).toEqual([expect.objectContaining({ turns: 5 })]);
  });

  it('counts a turn that still answered, and gives the question back when a turn fails outright', async () => {
    let n = 0;
    stub.on('POST', '/chat/completions', () => {
      n += 1;
      if (n === 1) {
        const tool_calls = [{ index: 0, id: 'call_0', type: 'function', function: { name: 'run_sql', arguments: JSON.stringify(JUNE_SQL) } }];
        return json({ choices: [{ message: { content: null, tool_calls }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
      }
      return json({ error: 'overloaded' }, { status: 503 });
    });
    const { ctx, flush } = makeCtx();
    const res = await chat('How much did I spend in June 2026?', { ctx, env: envWith({ AGENT_DAILY_QUESTIONS: '1' }) });
    await flush();
    expect((await res.json<{ answer?: string }>()).answer).toBeTruthy(); // answered from the tool data (fallback)
    expect(await rowsOf('agent_usage')).toEqual([expect.objectContaining({ prompt_tokens: 100, completion_tokens: 20, turns: 1 })]);
    expect((await chat('again', { env: envWith({ AGENT_DAILY_QUESTIONS: '1' }) })).status).toBe(429);

    // A turn that fails outright (no answer at all) is refunded, so the user can ask again.
    await testDb().prepare('DELETE FROM agent_usage').run();
    stub.on('POST', '/chat/completions', () => json({ error: 'overloaded' }, { status: 503 }));
    const failedCtx = makeCtx();
    const failed = await chat('hi', { db: null, ctx: failedCtx.ctx, env: envWith({ AGENT_DAILY_QUESTIONS: '1' }) });
    expect(await failed.json()).toMatchObject({ error: { code: 'assistant_busy' } });
    await failedCtx.flush();
    expect(await rowsOf('agent_usage')).toEqual([expect.objectContaining({ turns: 0 })]);
    deepseek([{ content: 'Hello!' }]);
    expect((await chat('hi again', { db: null, env: envWith({ AGENT_DAILY_QUESTIONS: '1' }) })).status).toBe(200);
  });

  it('concurrent requests cannot exceed the daily questions', async () => {
    deepseek([{ content: 'Hello!' }]);
    const env = envWith({ AGENT_DAILY_QUESTIONS: '3' });
    const results = await Promise.all(Array.from({ length: 8 }, () => chat('hi', { db: null, env })));
    expect(results.filter((r) => r.status === 429)).toHaveLength(5);
    expect(await rowsOf('agent_usage')).toEqual([expect.objectContaining({ turns: 3 })]);
  });

  it('fails open when the usage table cannot be read', async () => {
    deepseek([{ content: 'Hello!' }]);
    const res = await chat('hi', { db: null, env: envWith({ DB: failingOn(/FROM agent_usage/, 'D1_ERROR: no such table: agent_usage') }) });
    expect((await res.json<{ answer: string }>()).answer).toBe('Hello!');
  });
});

describe('POST /agent/feedback', () => {
  const turn_id = '3f2a9c1e-7b64-4d1a-9f0e-2b8c5d6e7a10';

  it('stores one rating per (user, turn) with the service role and the JWT user id', async () => {
    const res = await call('/feedback', { json: { turn_id: turn_id.toUpperCase(), rating: 'down', comment: '  Wrong total  ' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await rowsOf('agent_feedback')).toEqual([expect.objectContaining({ user_id: USER_ID, turn_id, rating: 'down', comment: 'Wrong total' })]);
    // Rating the same turn again replaces the previous rating.
    await call('/feedback', { json: { turn_id, rating: 'up' } });
    expect(await rowsOf('agent_feedback')).toEqual([expect.objectContaining({ user_id: USER_ID, turn_id, rating: 'up', comment: null })]);
  });

  it('stores a rating without a comment as null', async () => {
    await call('/feedback', { json: { turn_id, rating: 'up' } });
    expect(await oneRow('agent_feedback', 'turn_id = ?', turn_id)).toMatchObject({ user_id: USER_ID, rating: 'up', comment: null });
  });

  it('validates the body (422) and requires auth (401)', async () => {
    expect((await call('/feedback', { json: { turn_id: 'nope', rating: 'up' } })).status).toBe(422);
    expect((await call('/feedback', { json: { turn_id, rating: 'meh' } })).status).toBe(422);
    expect((await call('/feedback', { json: { turn_id, rating: 'up', comment: 'x'.repeat(1001) } })).status).toBe(422);
    expect((await call('/feedback', { json: { turn_id, rating: 'up' }, token: false })).status).toBe(401);
    expect(stub.calls).toHaveLength(0);
  });

  it('is rate limited with the write limiter', async () => {
    const res = await call('/feedback', { json: { turn_id, rating: 'up' }, env: envWith({ WRITE_LIMITER: { limit: () => Promise.resolve({ success: false }) } }) });
    expect(res.status).toBe(429);
  });
});

describe('agentErrorBody', () => {
  it('maps failures to stable codes without leaking detail', () => {
    expect(agentErrorBody(new TransientAiError('deepseek returned 503.')).error.code).toBe('assistant_busy');
    expect(agentErrorBody(new TurnTimeoutError('late')).error.code).toBe('assistant_busy');
    expect(agentErrorBody(new PermanentAiError('DEEPSEEK_API_KEY is missing')).error.code).toBe('assistant_error');
    expect(agentErrorBody(new Error('boom')).error.code).toBe('agent_failed');
    for (const err of [new TransientAiError('secret detail'), new PermanentAiError('secret detail'), new Error('secret detail')]) {
      expect(agentErrorBody(err).error.message).not.toContain('secret');
    }
  });
});
