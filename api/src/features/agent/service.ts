import type { Db } from '../../core/db';
import type { AppConfig } from '../../core/env';
import { log } from '../../core/logging';
import { PermanentAiError, TransientAiError } from '../ai/errors';
import { buildBlocks, buildDeepLink, collectEntityNames } from './blocks';
import { resolveTimezone } from './dates';
import { emptyUsage, TurnAbortedError } from './llm';
import type { ChatMessage, LlmClient, LlmRequest, LlmResult, ToolCall, Usage } from './llm';
import { signMemory, verifyMemory } from './memory';
import type { AgentMemory, MemoryContent } from './memory';
import { runPrepass } from './prepass';
import type { PrePass } from './prepass';
import { buildUserMessage, SYSTEM_PROMPT, verificationFeedback, wrapToolResult } from './prompts';
import type { AgentResponse, ChatRequest } from './schemas';
import { defaultQueries, executeQueries } from './queries';
import type { AgentQueries, QueryCall } from './queries';
import { NO_DATA_ANSWER, templateAnswer } from './template';
import type { ToolResult } from './template';
import { TOOL_BY_NAME, TOOL_SPECS, ToolArgError } from './tools';
import type { Prepared, ToolContext, ToolName, ToolOutput } from './tools';
import { numbersIn, verifyAnswer } from './verify';

/**
 * The agent turn: a bounded tool-calling loop.
 *
 *   pre-pass (time hint, trigram entity resolution, clarification) -> [LLM -> tools]* -> answer
 *
 * Guards: at most `maxSteps` tool steps (then the model must answer), at most 3 parallel tool calls per
 * step, a turn deadline (an AbortSignal runs through every request), and a numeric check of the answer
 * against the tool results (one regeneration, then a deterministic template). Everything the user sees
 * as numbers is the database's. Streaming and JSON modes share this code; only `emit` differs.
 */

const MAX_PARALLEL_TOOLS = 3;
/** Below this much time left a new model call is not worth starting. */
const MIN_LLM_MS = 1500;
/** The fallback model is only tried when at least this much time remains. */
const FALLBACK_MIN_MS = 4000;

export interface AgentDeps {
  config: AppConfig['agent'];
  llm: LlmClient;
  /** The D1 database the tools read (every query is scoped by the verified user id). */
  db: Db;
  /** The tool queries; tests replace single ones. */
  queries?: Partial<AgentQueries>;
  /** Epoch ms; overridable for tests. */
  now?: () => number;
  newId?: () => string;
}

export type AgentEvent = { type: 'step'; tool: ToolName; label: string } | { type: 'delta'; text: string };

export interface TurnOptions {
  userId: string;
  body: ChatRequest;
  /** Aborted when the client disconnects. */
  signal: AbortSignal;
  /** Receives progress events (SSE mode). Without it model calls do not stream. */
  emit?: (event: AgentEvent) => void;
  /** Token totals are added here as model calls finish, so a failed or aborted turn still reports what it spent. */
  usage?: Usage;
}

type Outcome = 'ok' | 'clarification' | 'template' | 'deadline' | 'aborted' | 'error';

export interface TurnResult {
  response: AgentResponse;
  usage: Usage;
  outcome: Outcome;
  trace: Trace;
}

/** The turn ran out of time before the model produced anything usable. */
export class TurnTimeoutError extends Error {
  override name = 'TurnTimeoutError';
}

/** What one turn did: the structured log line, and the `debug` object of the evals (X-Agent-Debug). */
interface Trace {
  steps: { tool: string; ms: number; rows: number; ok: boolean }[];
  /** Model calls that ended in tool calls (at most `maxSteps`). */
  tool_steps: number;
  llm: { model: string; ms: number; prompt_tokens: number; cache_hit_tokens: number; completion_tokens: number }[];
  verified: 'pass' | 'regenerated' | 'template' | 'n/a';
  outcome: Outcome;
}

const stripMarkup = (s: string): string => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

async function hashId(id: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Rejects when `signal` fires, without leaving the original promise's rejection unhandled. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(new TurnAbortedError('The turn was cancelled or ran out of time.'));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new TurnAbortedError('The turn was cancelled or ran out of time.'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

function addUsage(total: Usage, add: Usage): void {
  total.promptTokens += add.promptTokens;
  total.completionTokens += add.completionTokens;
  total.cacheHitTokens += add.cacheHitTokens;
}

export async function runAgentTurn(deps: AgentDeps, opts: TurnOptions): Promise<TurnResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const trace: Trace = { steps: [], tool_steps: 0, llm: [], verified: 'n/a', outcome: 'error' };
  try {
    const result = await runTurn(deps, opts, trace);
    trace.outcome = result.outcome;
    log.info('agent_turn', { user: await hashId(opts.userId), total_ms: now() - started, ...trace });
    return result;
  } catch (err) {
    trace.outcome = err instanceof TurnAbortedError || opts.signal.aborted ? 'aborted' : err instanceof TurnTimeoutError ? 'deadline' : 'error';
    log.warn('agent_turn', { user: await hashId(opts.userId), total_ms: now() - started, error: String(err), ...trace });
    throw err;
  }
}

async function runTurn(deps: AgentDeps, opts: TurnOptions, trace: Trace): Promise<TurnResult> {
  const { config } = deps;
  const now = deps.now ?? Date.now;
  const { userId, body, emit } = opts;
  const started = now();
  const deadline = started + config.turnTimeoutMs;
  const signal = AbortSignal.any([opts.signal, AbortSignal.timeout(config.turnTimeoutMs)]);

  const tz = resolveTimezone(body.timezone);
  const question = body.content.trim();
  const ctx: ToolContext = { tz, nowMs: started };
  const usage = opts.usage ?? emptyUsage();
  const results: ToolResult[] = [];
  const queries: AgentQueries = { ...defaultQueries, ...deps.queries };

  const memory = config.memorySecret ? await verifyMemory(config.memorySecret, body.memory, userId, started) : null;
  if (body.memory && !memory) log.info('agent_memory_ignored', { reason: config.memorySecret ? 'invalid_or_expired' : 'no_secret' });

  const prepass = await raceAbort(
    runPrepass({ text: question, tz, nowMs: started, userId, memory, db: deps.db, queries }),
    signal,
  );

  const finish = async (answer: string, outcome: Outcome): Promise<TurnResult> => {
    const text = answer.slice(0, 4000);
    const names = collectEntityNames(results, prepass.entities);
    const memoryToken = config.memorySecret
      ? await signMemory(config.memorySecret, userId, memoryContent({ prepass, results, names, memory, question, answer: text }), now())
      : '';
    return {
      response: {
        answer: text,
        blocks: buildBlocks(results),
        deep_link: buildDeepLink(results, names, tz),
        memory: memoryToken,
        turn_id: deps.newId?.() ?? crypto.randomUUID(),
      },
      usage,
      outcome,
      trace,
    };
  };

  if (prepass.clarification) {
    trace.verified = 'n/a';
    return finish(prepass.clarification, 'clarification');
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserMessage({ question, tz, nowMs: started, memory, history: body.history, prepass }) },
  ];

  /** One model call with the secondary model as a single fallback while time remains. Streams text when `stream`. */
  const callModel = async (request: Pick<LlmRequest, 'toolChoice'>, stream: boolean): Promise<LlmResult> => {
    const models = [config.model, ...(config.modelFallback && config.modelFallback !== config.model ? [config.modelFallback] : [])];
    let forwarded = false;
    let last: unknown;
    for (const [i, model] of models.entries()) {
      const remaining = deadline - now();
      if (remaining < MIN_LLM_MS || (i > 0 && remaining < FALLBACK_MIN_MS)) break;
      try {
        const res = await deps.llm({
          model,
          messages,
          tools: TOOL_SPECS,
          toolChoice: request.toolChoice,
          signal,
          timeoutMs: Math.min(config.llmTimeoutMs, remaining),
          // After text reached the client, a retry must not stream the same words again.
          ...(stream && emit && !forwarded
            ? {
                onDelta: (text: string) => {
                  forwarded = true;
                  emit({ type: 'delta', text });
                },
              }
            : {}),
        });
        addUsage(usage, res.usage);
        trace.llm.push({ model, ms: res.ms, prompt_tokens: res.usage.promptTokens, cache_hit_tokens: res.usage.cacheHitTokens, completion_tokens: res.usage.completionTokens });
        return res;
      } catch (err) {
        if (err instanceof TurnAbortedError) throw err;
        last = err;
      }
    }
    throw last instanceof Error ? last : new TransientAiError('No time left for a model call.');
  };

  /** Runs one step's tool calls; every call gets a tool message (the API requires it). */
  const runStep = async (calls: readonly ToolCall[]): Promise<ChatMessage[]> => {
    interface Slot {
      call: ToolCall;
      tool: ToolName | null;
      prepared: Prepared | null;
      error: string | null;
    }
    const slots: Slot[] = calls.map((call, index) => {
      const tool = TOOL_BY_NAME.get(call.function.name);
      if (!tool) return { call, tool: null, prepared: null, error: `Unknown tool "${call.function.name}". Available: ${[...TOOL_BY_NAME.keys()].join(', ')}.` };
      if (index >= MAX_PARALLEL_TOOLS) return { call, tool: tool.name, prepared: null, error: `At most ${MAX_PARALLEL_TOOLS} tool calls per step. Call this one again in the next step.` };
      emit?.({ type: 'step', tool: tool.name, label: tool.label });
      try {
        return { call, tool: tool.name, prepared: tool.prepare(call.function.arguments, ctx), error: null };
      } catch (err) {
        if (err instanceof ToolArgError) return { call, tool: tool.name, prepared: null, error: err.message };
        throw err;
      }
    });

    // The step's tools (and any extra block-only queries) run in parallel on D1.
    const runnable = slots.filter((s): s is Slot & { prepared: Prepared } => s.prepared !== null);
    const outcomes = new Map<Slot, { output: ToolOutput | null; error: string | null; ms: number }>();
    if (runnable.length > 0) {
      const calls: QueryCall[] = runnable.flatMap((s) => [s.prepared.call, ...(s.prepared.extra ?? [])]);
      const { results: raw, ms } = await raceAbort(executeQueries(queries, deps.db, userId, calls), signal);
      let at = 0;
      for (const slot of runnable) {
        const r = raw[at++];
        const extras = (slot.prepared.extra ?? []).map(() => raw[at++]);
        const extraValues = extras.every((e) => e?.ok) ? extras.map((e) => (e?.ok ? e.value : null)) : [];
        outcomes.set(slot, r?.ok ? { output: slot.prepared.shape(r.value, extraValues), error: null, ms } : { output: null, error: r?.ok === false ? r.error : 'No result.', ms });
      }
    }

    return slots.map((slot): ChatMessage => {
      const outcome = outcomes.get(slot);
      const error = slot.error ?? outcome?.error ?? null;
      const output = outcome?.output ?? null;
      if (slot.tool) {
        results.push({
          name: slot.tool,
          args: slot.prepared?.args ?? {},
          ok: error === null && output !== null,
          data: output?.data ?? null,
          error,
          ms: outcome?.ms ?? 0,
          rows: output?.rows ?? 0,
          blockData: output?.blockData ?? null,
        });
        trace.steps.push({ tool: slot.tool, ms: outcome?.ms ?? 0, rows: output?.rows ?? 0, ok: error === null && output !== null });
      }
      return { role: 'tool', tool_call_id: slot.call.id, content: wrapToolResult(slot.tool ?? slot.call.function.name, error !== null ? { error } : (output?.data ?? {})) };
    });
  };

  /** Model and tools until the model answers (the draft text), or the step limit forces it to. */
  const converse = async (): Promise<string> => {
    let toolSteps = 0;
    for (;;) {
      if (deadline - now() < MIN_LLM_MS) throw new TurnAbortedError('out of time');
      const mustAnswer = toolSteps >= config.maxSteps;
      const res = await callModel({ toolChoice: mustAnswer ? 'none' : 'auto' }, true);
      if (res.toolCalls.length === 0 || mustAnswer) return res.content;
      toolSteps += 1;
      trace.tool_steps = toolSteps;
      messages.push({ role: 'assistant', content: res.content || null, tool_calls: res.toolCalls });
      messages.push(...(await runStep(res.toolCalls)));
    }
  };

  /* ---- the loop ---- */
  let answer: string;
  try {
    answer = await converse();
  } catch (err) {
    if (opts.signal.aborted) throw err; // the client left: nothing to answer
    const expected = err instanceof TurnAbortedError || err instanceof TransientAiError || err instanceof PermanentAiError;
    if (!expected) throw err;
    // Out of time or the model is down: with data in hand answer from it, else report the failure.
    if (!results.some((r) => r.ok)) {
      if (err instanceof TurnAbortedError) throw new TurnTimeoutError('The turn ran out of time.');
      throw err;
    }
    trace.verified = 'template';
    return finish(templateAnswer(results), err instanceof TurnAbortedError ? 'deadline' : 'template');
  }

  /* ---- verification ---- */
  const allowed = [...results.flatMap((r) => (r.ok ? numbersIn(r.data) : [])), ...numbersIn(question)];
  const fallback = (): Promise<TurnResult> => {
    trace.verified = 'template';
    return finish(results.some((r) => r.ok) ? templateAnswer(results) : NO_DATA_ANSWER, 'template');
  };

  let draft = answer.trim();
  if (draft === '') return fallback();
  const first = verifyAnswer(draft, allowed);
  if (first.ok) {
    trace.verified = 'pass';
    return finish(draft, 'ok');
  }

  // One regeneration with the offending figures named; still wrong means the deterministic template.
  log.info('agent_answer_unverified', { unmatched: first.unmatched.slice(0, 6) });
  messages.push({ role: 'assistant', content: draft }, { role: 'user', content: verificationFeedback(first.unmatched) });
  try {
    draft = (await callModel({ toolChoice: 'none' }, false)).content.trim();
  } catch (err) {
    if (opts.signal.aborted) throw err;
    return fallback();
  }
  if (draft !== '' && verifyAnswer(draft, allowed).ok) {
    trace.verified = 'regenerated';
    return finish(draft, 'ok');
  }
  return fallback();
}

/** What the next turn needs to remember (the signed memory token carries this). */
function memoryContent(input: {
  prepass: PrePass;
  results: readonly ToolResult[];
  names: ReadonlyMap<string, string>;
  memory: AgentMemory | null;
  question: string;
  answer: string;
}): MemoryContent {
  const { prepass, results, names, memory } = input;
  const scoped = [...results].reverse().find((r) => r.ok && typeof r.args['from'] === 'string' && typeof r.args['to'] === 'string');
  const from = scoped ? String(scoped.args['from']) : null;
  const to = scoped ? String(scoped.args['to']) : null;
  const known = prepass.range ?? memory?.time_range ?? null;
  const time_range =
    from && to ? { from, to, label: known && known.from === from && known.to === to ? known.label : from === to ? from : `${from} to ${to}` } : known ? { from: known.from, to: known.to, label: known.label } : null;

  const entities = new Map<string, { type: 'payee' | 'category'; id: string; name: string }>();
  const add = (type: 'payee' | 'category', id: unknown) => {
    const name = typeof id === 'string' ? names.get(`${type}:${id}`) : undefined;
    if (typeof id === 'string' && name) entities.set(`${type}:${id}`, { type, id, name });
  };
  for (const e of [...prepass.entities, ...prepass.clarificationOptions]) entities.set(`${e.type}:${e.id}`, { type: e.type, id: e.id, name: e.name });
  for (const r of results) {
    add('payee', r.args['payee_key']);
    add('category', r.args['category_id']);
  }
  const carried = entities.size === 0 && memory ? memory.entities : [...entities.values()];

  return {
    time_range,
    entities: carried.slice(0, 5),
    last_tools: [...new Set(results.map((r) => r.name))],
    summary: `Asked: ${stripMarkup(input.question).slice(0, 110)} | Said: ${stripMarkup(input.answer).slice(0, 170)}`.slice(0, 300),
  };
}
