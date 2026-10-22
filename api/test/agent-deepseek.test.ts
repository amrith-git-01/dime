import { describe, expect, it } from 'vitest';

import { PermanentAiError, TransientAiError } from '../src/features/ai/errors';
import { createDeepSeekClient, TurnAbortedError } from '../src/features/agent/llm';
import type { LlmRequest, ToolSpec } from '../src/features/agent/llm';

const TOOLS: ToolSpec[] = [{ type: 'function', function: { name: 'spending_summary', description: 'd', parameters: { type: 'object', properties: {} } } }];

const completion = (message: Record<string, unknown>, usage: Record<string, unknown> = {}) => ({
  choices: [{ index: 0, message, finish_reason: 'stop' }],
  usage: { prompt_tokens: 120, completion_tokens: 30, prompt_cache_hit_tokens: 100, prompt_cache_miss_tokens: 20, ...usage },
});

interface Captured {
  url: string;
  body: Record<string, unknown>;
  headers: Headers;
  signal: AbortSignal | null | undefined;
}

function client(respond: (c: Captured) => Response | Promise<Response>) {
  const captured: Captured[] = [];
  const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const c: Captured = { url, body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>, headers: new Headers(init?.headers), signal: init?.signal };
    captured.push(c);
    return respond(c);
  }) as typeof fetch;
  return { chat: createDeepSeekClient({ baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test', fetch: fetchStub }), captured };
}

const request = (extra: Partial<LlmRequest> = {}): LlmRequest => ({
  model: 'deepseek-v4-flash',
  messages: [{ role: 'user', content: 'hi' }],
  tools: TOOLS,
  signal: new AbortController().signal,
  timeoutMs: 5000,
  ...extra,
});

const sse = (chunks: unknown[], opts: { done?: boolean; split?: number } = {}) => {
  const text = [': keep-alive', '', ...chunks.map((c) => `data: ${JSON.stringify(c)}`), ...(opts.done === false ? [] : ['data: [DONE]']), ''].join('\n\n');
  const bytes = new TextEncoder().encode(text);
  const size = opts.split ?? bytes.length;
  const parts: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) parts.push(bytes.slice(i, i + size));
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const p of parts) controller.enqueue(p);
        controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
};

describe('DeepSeek client: request', () => {
  it('sends tools, non-thinking mode, temperature 0 and the bearer key to /chat/completions', async () => {
    const { chat, captured } = client(() => Response.json(completion({ content: 'hello' })));
    const res = await chat(request({ toolChoice: 'none', maxTokens: 500 }));
    expect(captured[0]?.url).toBe('https://api.deepseek.com/chat/completions');
    expect(captured[0]?.headers.get('authorization')).toBe('Bearer sk-test');
    expect(captured[0]?.body).toMatchObject({
      model: 'deepseek-v4-flash',
      tools: TOOLS,
      tool_choice: 'none',
      temperature: 0,
      max_tokens: 500,
      thinking: { type: 'disabled' },
    });
    expect(captured[0]?.body['stream']).toBeUndefined();
    expect(res.content).toBe('hello');
  });

  it('turns on JSON mode only when asked', async () => {
    const { chat, captured } = client(() => Response.json(completion({ content: '{}' })));
    await chat(request({ tools: undefined, responseFormat: 'json_object' }));
    await chat(request());
    expect(captured[0]?.body['response_format']).toEqual({ type: 'json_object' });
    expect(captured[0]?.body).toMatchObject({ temperature: 0, thinking: { type: 'disabled' } });
    expect('response_format' in (captured[1]?.body ?? {})).toBe(false);
  });

  it('omits tool_choice when there are no tools, and streams with usage when a delta callback is given', async () => {
    const { chat, captured } = client(() => sse([{ choices: [{ delta: { content: 'hi' } }] }]));
    await chat(request({ tools: undefined, onDelta: () => undefined }));
    expect(captured[0]?.body['tools']).toBeUndefined();
    expect(captured[0]?.body['tool_choice']).toBeUndefined();
    expect(captured[0]?.body).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });

  it('refuses to call without a key', async () => {
    const chat = createDeepSeekClient({ baseUrl: 'https://api.deepseek.com', apiKey: undefined, fetch: () => Promise.reject(new Error('no')) });
    await expect(chat(request())).rejects.toBeInstanceOf(PermanentAiError);
  });
});

describe('DeepSeek client: non-streaming results', () => {
  it('parses content, tool calls and usage including the prefix cache hits', async () => {
    const { chat } = client(() =>
      Response.json(
        completion({
          content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'spending_summary', arguments: '{"from":"2026-06-01"}' } }],
        }),
      ),
    );
    const res = await chat(request());
    expect(res.content).toBe('');
    expect(res.toolCalls).toEqual([{ id: 'call_1', type: 'function', function: { name: 'spending_summary', arguments: '{"from":"2026-06-01"}' } }]);
    expect(res.usage).toEqual({ promptTokens: 120, completionTokens: 30, cacheHitTokens: 100 });
  });

  it('reads cached tokens from prompt_tokens_details when the provider reports them there', async () => {
    const { chat } = client(() => Response.json({ choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 10, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 8 } } }));
    expect((await chat(request())).usage.cacheHitTokens).toBe(8);
  });
});

describe('DeepSeek client: streaming', () => {
  it('forwards content deltas in order and returns the whole text with usage from the final chunk', async () => {
    const pieces: string[] = [];
    const { chat } = client(() =>
      sse(
        [
          { choices: [{ delta: { role: 'assistant', content: '' } }] },
          { choices: [{ delta: { content: 'You ' } }] },
          { choices: [{ delta: { content: 'spent ₹1,200.' } }] },
          { choices: [{ delta: {}, finish_reason: 'stop' }] },
          { choices: [], usage: { prompt_tokens: 50, completion_tokens: 6, prompt_cache_hit_tokens: 40 } },
        ],
        { split: 7 }, // chunk boundaries inside lines and inside multi-byte characters
      ),
    );
    const res = await chat(request({ onDelta: (t) => pieces.push(t) }));
    expect(pieces).toEqual(['You ', 'spent ₹1,200.']);
    expect(res.content).toBe('You spent ₹1,200.');
    expect(res.finishReason).toBe('stop');
    expect(res.usage).toEqual({ promptTokens: 50, completionTokens: 6, cacheHitTokens: 40 });
  });

  it('assembles parallel tool calls from argument fragments by index and does not forward text after a call starts', async () => {
    const pieces: string[] = [];
    const { chat } = client(() =>
      sse([
        { choices: [{ delta: { content: 'Let me check. ' } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', type: 'function', function: { name: 'spending_summary', arguments: '{"from":' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 1, id: 'b', type: 'function', function: { name: 'top_payees', arguments: '{"limit":3,' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"2026-06-01","to":"2026-06-30"}' } }] } }] },
        { choices: [{ delta: { content: ' (ignored text)' } }] },
        { choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '"from":"2026-06-01","to":"2026-06-30"}' } }] }, finish_reason: 'tool_calls' }] },
        { choices: [], usage: { prompt_tokens: 9, completion_tokens: 3 } },
      ]),
    );
    const res = await chat(request({ onDelta: (t) => pieces.push(t) }));
    expect(pieces).toEqual(['Let me check. ']);
    expect(res.toolCalls.map((c) => [c.id, c.function.name, JSON.parse(c.function.arguments) as unknown])).toEqual([
      ['a', 'spending_summary', { from: '2026-06-01', to: '2026-06-30' }],
      ['b', 'top_payees', { limit: 3, from: '2026-06-01', to: '2026-06-30' }],
    ]);
    expect(res.finishReason).toBe('tool_calls');
  });

  it('tolerates a missing [DONE] and non-JSON lines', async () => {
    const { chat } = client(() => sse([{ choices: [{ delta: { content: 'ok' } }] }], { done: false }));
    expect((await chat(request({ onDelta: () => undefined }))).content).toBe('ok');
  });
});

describe('DeepSeek client: failures', () => {
  it('classifies HTTP statuses: 429 and 5xx are transient, 4xx permanent', async () => {
    for (const [status, type] of [
      [429, TransientAiError],
      [503, TransientAiError],
      [400, PermanentAiError],
      [401, PermanentAiError],
    ] as const) {
      const { chat } = client(() => new Response('{"error":{"message":"secret provider detail"}}', { status }));
      const err = await chat(request()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(type);
      expect((err as Error).message).not.toContain('secret provider detail');
    }
  });

  it('maps a network error to a transient failure', async () => {
    const { chat } = client(() => Promise.reject(new TypeError('network down')));
    await expect(chat(request())).rejects.toBeInstanceOf(TransientAiError);
  });

  it('throws TurnAbortedError when the caller signal fires, before and during the request', async () => {
    const before = new AbortController();
    before.abort();
    const { chat } = client((c) => (c.signal?.aborted ? Promise.reject(new DOMException('aborted', 'AbortError')) : Response.json(completion({ content: 'x' }))));
    await expect(chat(request({ signal: before.signal }))).rejects.toBeInstanceOf(TurnAbortedError);

    const during = new AbortController();
    const slow = client(
      (c) =>
        new Promise<Response>((_resolve, reject) => {
          c.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          during.abort();
        }),
    );
    await expect(slow.chat(request({ signal: during.signal }))).rejects.toBeInstanceOf(TurnAbortedError);
  });

  it('turns its own timeout into a transient error (not an abort)', async () => {
    const slow = client(
      (c) =>
        new Promise<Response>((_resolve, reject) => {
          c.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError')));
        }),
    );
    await expect(slow.chat(request({ timeoutMs: 20 }))).rejects.toBeInstanceOf(TransientAiError);
  });

  it('treats an unusable body as a permanent failure', async () => {
    const { chat } = client(() => Response.json({ nothing: true }));
    await expect(chat(request())).rejects.toBeInstanceOf(PermanentAiError);
  });
});
