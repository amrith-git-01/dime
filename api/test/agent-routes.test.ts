import { describe, expect, it } from 'vitest';

import type { Bindings } from '../src/core/env';
import { agentErrorBody } from '../src/features/agent/routes';
import { PermanentAiError, TransientAiError } from '../src/features/ai/errors';
import { completion } from './ingest-fixtures';
import { call, makeCtx, makeEnv } from './helpers';
import { json, pgError, useSupabaseStub } from './supabase-stub';

const stub = useSupabaseStub();

const envWith = (extra: Record<string, unknown> = {}): Bindings =>
  ({ ...makeEnv({ DEEPSEEK_API_KEY: 'test-deepseek-key' }), AI_LIMITER: undefined, ...extra }) as unknown as Bindings;

const classify = (content: unknown) => (call_: { body: unknown }) => {
  const messages = (call_.body as { messages: { content: string }[] }).messages;
  const system = messages[0]?.content ?? '';
  const answers = content as Record<string, unknown>;
  const node = system.includes('Classify whether') ? 'classify' : system.includes('Write one read-only SELECT') ? 'sql' : 'respond';
  return json(completion(JSON.stringify(answers[node])));
};

describe('POST /agent/chat: request handling', () => {
  it('401 without a token', async () => {
    expect((await call('/api/v1/agent/chat', { method: 'POST', json: { content: 'hi' }, token: false })).status).toBe(401);
    expect(stub.calls).toHaveLength(0);
  });

  it('422 for an invalid body (FastAPI shape)', async () => {
    const missing = await call('/api/v1/agent/chat', { method: 'POST', json: {}, env: envWith() });
    expect(missing.status).toBe(422);
    expect(await missing.json()).toEqual({ detail: [{ type: 'missing', loc: ['body', 'content'], msg: 'Field required' }] });

    const empty = await call('/api/v1/agent/chat', { method: 'POST', json: { content: '' }, env: envWith() });
    expect(empty.status).toBe(422);
    const badRole = await call('/api/v1/agent/chat', {
      method: 'POST',
      json: { content: 'hi', history: [{ role: 'system', content: 'x' }] },
      env: envWith(),
    });
    expect(badRole.status).toBe(422);
    const tooLong = await call('/api/v1/agent/chat', { method: 'POST', json: { content: 'x'.repeat(4001) }, env: envWith() });
    expect(tooLong.status).toBe(422);
    expect(stub.calls).toHaveLength(0);
  });

  it('400 for an unknown timezone (before any model call)', async () => {
    const res = await call('/api/v1/agent/chat', { method: 'POST', json: { content: 'hi', timezone: 'Mars/Base' }, env: envWith() });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "Invalid timezone: 'Mars/Base'" });
    expect(stub.calls).toHaveLength(0);
  });

  it('413 for an oversized body', async () => {
    const res = await call('/api/v1/agent/chat', { method: 'POST', json: { content: 'hi', history: [], pad: 'x'.repeat(1024 * 1024) }, env: envWith() });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ detail: 'Request body too large.' });
  });

  it('429 when the AI limiter rejects', async () => {
    const env = envWith({ AI_LIMITER: { limit: () => Promise.resolve({ success: false }) } });
    const res = await call('/api/v1/agent/chat', { method: 'POST', json: { content: 'hi' }, env });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('10');
  });
});

describe('POST /agent/chat: outcomes', () => {
  it('200 ChatResponse for a compare question (insights aggregates, no database connection)', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_daily_totals', () => json([{ day: '2026-06-10', credit_total: 0, debit_total: 100, credit_count: 0, debit_count: 1 }]));
    stub.on('POST', '/rest/v1/rpc/transactions_payee_totals', () => json([]));
    stub.on(
      'POST',
      '/chat/completions',
      classify({
        classify: { comparison_kind: 'month_pair', period_a: { year: 2026, month: 6 }, period_b: { year: 2026, month: 5 } },
        respond: { answer: 'You spent **₹100** more.', chart: null, deep_link: null },
      }),
    );
    const res = await call('/api/v1/agent/chat', {
      method: 'POST',
      json: { content: 'june vs may', timezone: 'Asia/Kolkata', history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] },
      env: envWith({ HYPERDRIVE: undefined }), // the compare route needs no SQL connection
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json<{ answer: string; blocks: { type: string }[]; deep_link: unknown }>();
    expect(Object.keys(body).sort()).toEqual(['answer', 'blocks', 'deep_link']);
    expect(body.answer).toBe('You spent **₹100** more.');
    expect(body.deep_link).toBeNull();
    expect(body.blocks[0]?.type).toBe('compare_months');

    const llmCalls = stub.find('POST', '/chat/completions');
    expect(llmCalls).toHaveLength(2);
    expect(llmCalls[0]?.headers.get('authorization')).toBe('Bearer test-deepseek-key');
    expect(llmCalls[0]?.url.host).toBe('api.deepseek.com');
  });

  it('a clarification is a plain 200 answer', async () => {
    const res = await call('/api/v1/agent/chat', { method: 'POST', json: { content: 'daily spending for the last 90 days', timezone: 'UTC' }, env: envWith() });
    expect(res.status).toBe(200);
    expect((await res.json<{ answer: string }>()).answer).toContain('40 days');
    expect(stub.calls).toHaveLength(0);
  });

  it('C5: a failing model is HTTP 200 with {"error": {code, message}}', async () => {
    stub.on('POST', '/chat/completions', () => json({}, { status: 500 }));
    const res = await call('/api/v1/agent/chat', { method: 'POST', json: { content: 'how much on food?', timezone: 'UTC' }, env: envWith() });
    expect(res.status).toBe(200);
    const body = await res.json<{ error: { code: string; message: string } }>();
    expect(body).toEqual({ error: { code: 'assistant_busy', message: 'The assistant is busy right now. Please try again in a moment.' } });
    expect(JSON.stringify(body)).not.toMatch(/deepseek|500|key/i); // provider detail never reaches the client
  });

  it('503 + Retry-After when the database (Hyperdrive) is unavailable', async () => {
    stub.on(
      'POST',
      '/chat/completions',
      classify({ classify: { comparison_kind: null, period_a: null, period_b: null }, sql: { sql: 'SELECT 1 FROM transactions' } }),
    );
    const { ctx, flush } = makeCtx();
    const res = await call(
      '/api/v1/agent/chat',
      { method: 'POST', json: { content: 'how much on food?', timezone: 'UTC' }, env: envWith({ HYPERDRIVE: undefined }) },
      ctx,
    );
    await flush();
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('10');
    expect(await res.json()).toEqual({ detail: 'Assistant is temporarily unavailable. Try again shortly.' });
  });

  it('compare aggregates failing falls back to the SQL route (here: no database, so 503)', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_daily_totals', () => pgError('XX000', 'boom', 500));
    stub.on('GET', '/rest/v1/transactions', () => pgError('XX000', 'boom', 500));
    stub.on(
      'POST',
      '/chat/completions',
      classify({
        classify: { comparison_kind: 'year_pair', period_a: { year: 2026, ytd: true }, period_b: { year: 2025, ytd: false } },
        sql: { sql: 'SELECT 1 FROM transactions' },
      }),
    );
    // The fallback is the SQL route, which here hits the missing database: a 503, not a 500.
    const res = await call('/api/v1/agent/chat', { method: 'POST', json: { content: '2026 vs 2025', timezone: 'UTC' }, env: envWith({ HYPERDRIVE: undefined }) });
    expect(res.status).toBe(503);
  });
});

describe('agentErrorBody', () => {
  it('maps failures to stable codes without leaking detail', () => {
    expect(agentErrorBody(new TransientAiError('deepseek returned 503.')).error.code).toBe('assistant_busy');
    expect(agentErrorBody(new PermanentAiError('DEEPSEEK_API_KEY is missing')).error.code).toBe('assistant_error');
    expect(agentErrorBody(new Error('boom')).error.code).toBe('agent_failed');
    for (const err of [new TransientAiError('secret detail'), new PermanentAiError('secret detail'), new Error('secret detail')]) {
      expect(agentErrorBody(err).error.message).not.toContain('secret');
    }
  });
});
