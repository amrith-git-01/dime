import { log } from '../../core/logging';
import { PermanentAiError, TransientAiError } from '../ai/errors';
import { upstreamStatusError } from '../ai/http';

/**
 * The one DeepSeek chat-completions client of the agent: function calling, non-thinking, optional
 * streaming (`stream: true` + `stream_options.include_usage`), an AbortSignal deadline on every
 * request and usage capture (`prompt_cache_hit_tokens` included).
 *
 * Failures are `TransientAiError` (network, timeout, 408/425/429/5xx), `PermanentAiError` (other
 * statuses, an unusable body) or `TurnAbortedError` (the caller's signal fired: client gone or the
 * turn deadline passed).
 */

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  /** Prompt tokens served from DeepSeek's prefix cache. */
  cacheHitTokens: number;
}

export const emptyUsage = (): Usage => ({ promptTokens: 0, completionTokens: 0, cacheHitTokens: 0 });

export interface LlmRequest {
  model: string;
  messages: readonly ChatMessage[];
  tools?: readonly ToolSpec[];
  /** `none` forces a plain answer (the tool list stays in the request so the prefix cache still hits). */
  toolChoice?: 'auto' | 'none';
  /** Aborts the request. A request timeout is derived from `timeoutMs` and linked to it. */
  signal: AbortSignal;
  timeoutMs: number;
  maxTokens?: number;
  /** `json_object` turns on DeepSeek's JSON mode (the prompt must still say "json"). Unset leaves the request as it was. */
  responseFormat?: 'json_object';
  /** When set, the request streams and this receives every content delta. */
  onDelta?: (text: string) => void;
}

export interface LlmResult {
  model: string;
  content: string;
  toolCalls: ToolCall[];
  finishReason: string | null;
  usage: Usage;
  ms: number;
}

export type LlmClient = (request: LlmRequest) => Promise<LlmResult>;

/** The caller's signal fired (the client went away or the turn deadline passed), not the model's fault. */
export class TurnAbortedError extends Error {
  override name = 'TurnAbortedError';
}

const DEFAULT_MAX_TOKENS = 1200;

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function parseUsage(raw: unknown): Usage {
  const u = asRecord(raw);
  if (!u) return emptyUsage();
  const details = asRecord(u['prompt_tokens_details']);
  return {
    promptTokens: num(u['prompt_tokens']),
    completionTokens: num(u['completion_tokens']),
    cacheHitTokens: num(u['prompt_cache_hit_tokens']) || num(details?.['cached_tokens']),
  };
}

function toolCallsOf(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return [];
  const out: ToolCall[] = [];
  for (const item of raw) {
    const call = asRecord(item);
    const fn = asRecord(call?.['function']);
    if (!call || !fn || typeof fn['name'] !== 'string') continue;
    out.push({
      id: typeof call['id'] === 'string' && call['id'] ? call['id'] : `call_${out.length}`,
      type: 'function',
      function: { name: fn['name'], arguments: typeof fn['arguments'] === 'string' ? fn['arguments'] : '' },
    });
  }
  return out;
}

function parseCompletion(data: unknown, model: string, started: number): LlmResult {
  const choice = asRecord(Array.isArray(asRecord(data)?.['choices']) ? (asRecord(data)?.['choices'] as unknown[])[0] : null);
  const message = asRecord(choice?.['message']);
  if (!message) throw new PermanentAiError('deepseek returned an unexpected payload.');
  return {
    model,
    content: typeof message['content'] === 'string' ? message['content'] : '',
    toolCalls: toolCallsOf(message['tool_calls']),
    finishReason: typeof choice?.['finish_reason'] === 'string' ? choice['finish_reason'] : null,
    usage: parseUsage(asRecord(data)?.['usage']),
    ms: Date.now() - started,
  };
}

/** Accumulates the chunks of a streamed completion (content text, tool calls by index, usage). */
class StreamAccumulator {
  content = '';
  finishReason: string | null = null;
  usage = emptyUsage();
  private readonly calls = new Map<number, ToolCall>();

  constructor(private readonly onDelta: ((text: string) => void) | undefined) {}

  get toolCalls(): ToolCall[] {
    return [...this.calls.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => call);
  }

  push(chunk: unknown): void {
    const root = asRecord(chunk);
    if (!root) return;
    if (root['usage']) this.usage = parseUsage(root['usage']);
    const choice = asRecord(Array.isArray(root['choices']) ? (root['choices'] as unknown[])[0] : null);
    if (!choice) return;
    if (typeof choice['finish_reason'] === 'string') this.finishReason = choice['finish_reason'];
    const delta = asRecord(choice['delta']);
    if (!delta) return;
    if (Array.isArray(delta['tool_calls'])) {
      for (const raw of delta['tool_calls'] as unknown[]) {
        const part = asRecord(raw);
        if (!part) continue;
        const index = typeof part['index'] === 'number' ? part['index'] : this.calls.size;
        const fn = asRecord(part['function']);
        const call = this.calls.get(index) ?? { id: '', type: 'function' as const, function: { name: '', arguments: '' } };
        if (typeof part['id'] === 'string' && part['id']) call.id = part['id'];
        if (typeof fn?.['name'] === 'string') call.function.name += fn['name'];
        if (typeof fn?.['arguments'] === 'string') call.function.arguments += fn['arguments'];
        this.calls.set(index, call);
      }
    }
    // Once the model starts a tool call, stop forwarding text: the answer text is the LAST call's content.
    if (typeof delta['content'] === 'string' && delta['content'] !== '') {
      this.content += delta['content'];
      if (this.calls.size === 0) this.onDelta?.(delta['content']);
    }
  }
}

/** `data:` payloads of a server-sent-events body, in order (comment lines and blank lines are skipped). */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('data:')) yield line.slice(5).trim();
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith('data:')) yield tail.slice(5).trim();
  } finally {
    reader.releaseLock();
  }
}

function endpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
}

export function createDeepSeekClient(options: { baseUrl: string; apiKey: string | undefined; fetch?: typeof fetch }): LlmClient {
  const doFetch = options.fetch ?? fetch;

  return async (request) => {
    if (!options.apiKey) throw new PermanentAiError('DEEPSEEK_API_KEY is missing');
    const started = Date.now();
    const stream = request.onDelta !== undefined;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(request.timeoutMs)]);
    const tools = request.tools && request.tools.length > 0 ? request.tools : undefined;
    const body = {
      model: request.model,
      messages: request.messages,
      ...(tools ? { tools, tool_choice: request.toolChoice ?? 'auto' } : {}),
      temperature: 0,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(request.responseFormat ? { response_format: { type: request.responseFormat } } : {}),
      thinking: { type: 'disabled' },
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    };

    try {
      let res: Response;
      try {
        res = await doFetch(endpoint(options.baseUrl), {
          method: 'POST',
          headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });
      } catch (err) {
        throw failure(request.signal, err);
      }
      if (!res.ok) throw await upstreamStatusError('deepseek', res);

      if (!stream || !res.body) {
        let data: unknown;
        try {
          data = await res.json();
        } catch (err) {
          throw failure(request.signal, err, true);
        }
        return parseCompletion(data, request.model, started);
      }

      const acc = new StreamAccumulator(request.onDelta);
      try {
        for await (const payload of sseData(res.body as ReadableStream<Uint8Array>)) {
          if (payload === '[DONE]') break;
          let chunk: unknown;
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue; // a truncated or non-JSON keep-alive line
          }
          acc.push(chunk);
        }
      } catch (err) {
        throw failure(request.signal, err);
      }
      return {
        model: request.model,
        content: acc.content,
        toolCalls: acc.toolCalls,
        finishReason: acc.finishReason,
        usage: acc.usage,
        ms: Date.now() - started,
      };
    } catch (err) {
      if (!(err instanceof TurnAbortedError)) log.warn('agent_llm_failed', { model: request.model, err: String(err) });
      throw err;
    }
  };
}

/** Maps a thrown fetch / body error: the caller's signal means "aborted", a bad body is permanent, the rest transient. */
function failure(callerSignal: AbortSignal, err: unknown, badBody = false): Error {
  if (callerSignal.aborted) return new TurnAbortedError('The turn was cancelled or ran out of time.', { cause: err });
  if (badBody) return new PermanentAiError('deepseek returned invalid JSON.', { cause: err });
  return new TransientAiError('deepseek request failed.', { cause: err });
}
