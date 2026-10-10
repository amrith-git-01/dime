import { Hono } from 'hono';
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';

import { currentUser, requireAuth } from '../../core/auth';
import { limitBody } from '../../core/body-limit';
import { defer } from '../../core/background';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { AppError } from '../../core/errors';
import { log } from '../../core/logging';
import { rateLimit } from '../../core/rate-limit';
import { getDb } from '../../core/db';
import { validate } from '../../core/validation';
import { PermanentAiError, TransientAiError } from '../ai/errors';
import { resolveTimezone } from './dates';
import { createDeepSeekClient, TurnAbortedError } from './llm';
import { chatRequestSchema, feedbackRequestSchema } from './schemas';
import type { AgentErrorBody } from './schemas';
import { runAgentTurn, TurnTimeoutError } from './service';
import type { AgentDeps, AgentEvent, TurnResult } from './service';
import type { AgentQueries } from './queries';
import { recordUsage, saveFeedback, tokensUsedToday } from './usage';

/** Seams for tests; production uses the defaults. */
export interface AgentRouteDeps {
  /** Replaces single tool queries (tests). */
  queries?: Partial<AgentQueries>;
  now: () => number;
}

/** Contract C5: a failed turn is `{"error": {code, message}}` (HTTP 200, or the SSE `error` event). */
export function agentErrorBody(err: unknown): AgentErrorBody {
  if (err instanceof TurnTimeoutError || err instanceof TurnAbortedError || err instanceof TransientAiError) {
    return { error: { code: 'assistant_busy', message: 'The assistant is busy right now. Please try again in a moment.' } };
  }
  if (err instanceof PermanentAiError) {
    return { error: { code: 'assistant_error', message: 'The assistant could not answer that. Please try again.' } };
  }
  return { error: { code: 'agent_failed', message: 'Something went wrong while answering. Please try again.' } };
}

/** 4 000 chars of question + the history the app sends: far below this. */
const CHAT_BODY_LIMIT_BYTES = 1024 * 1024;
const FEEDBACK_BODY_LIMIT_BYTES = 16 * 1024;

/** Kill switch and daily token budget, as C5 error bodies. Null means "go ahead". */
async function refusal(c: Context<AppBindings>, userId: string, nowMs: number): Promise<AgentErrorBody['error'] | null> {
  const config = getConfig(c.env).agent;
  if (!config.enabled) return { code: 'agent_disabled', message: 'The assistant is switched off right now. Please try again later.' };
  const used = await tokensUsedToday(getDb(c), userId, nowMs);
  if (used !== null && used >= config.dailyTokenBudget) {
    return { code: 'daily_limit', message: "You've reached today's assistant limit. It resets tomorrow." };
  }
  return null;
}

export function createAgentRoutes(overrides: Partial<AgentRouteDeps> = {}): Hono<AppBindings> {
  const routeDeps: AgentRouteDeps = { now: Date.now, ...overrides };
  const router = new Hono<AppBindings>();
  router.use(requireAuth);

  router.post('/chat', rateLimit('AI_LIMITER'), limitBody(CHAT_BODY_LIMIT_BYTES), validate('json', chatRequestSchema), async (c) => {
    const user = currentUser(c);
    const config = getConfig(c.env);
    const body = c.req.valid('json');
    const wantsStream = (c.req.header('accept') ?? '').includes('text/event-stream');
    resolveTimezone(body.timezone); // a bad timezone is a plain 400, before anything is opened

    const refused = await refusal(c, user.id, routeDeps.now());
    if (refused) {
      return wantsStream
        ? streamSSE(c, async (stream) => void (await stream.writeSSE({ event: 'error', data: JSON.stringify(refused) })))
        : c.json({ error: refused });
    }

    const deps: AgentDeps = {
      config: config.agent,
      llm: createDeepSeekClient({ baseUrl: config.agent.baseUrl, apiKey: config.ai.apiKey }),
      db: getDb(c),
      ...(routeDeps.queries ? { queries: routeDeps.queries } : {}),
      now: routeDeps.now,
    };
    // Evals only: `X-Agent-Debug: 1` adds what the turn did (tools, model calls, tokens). It carries no user data.
    const debug = c.req.header('x-agent-debug') === '1';
    const payload = (result: TurnResult) => (debug ? { ...result.response, debug: { ...result.trace, tokens: result.usage } } : result.response);
    const track = (result: TurnResult) => {
      if (result.usage.promptTokens + result.usage.completionTokens > 0) {
        defer(c, recordUsage(getDb(c), user.id, routeDeps.now(), result.usage), 'agent-usage');
      }
    };

    if (!wantsStream) {
      try {
        const result = await runAgentTurn(deps, { userId: user.id, body, signal: c.req.raw.signal });
        track(result);
        return c.json(payload(result));
      } catch (err) {
        if (err instanceof AppError) throw err; // e.g. a missing service key (503)
        log.error('agent_turn_failed', { err, userId: user.id });
        return c.json(agentErrorBody(err));
      }
    }

    return streamSSE(c, async (stream) => {
      const controller = new AbortController();
      stream.onAbort(() => controller.abort());
      // Writes are chained so events always leave in the order they were produced.
      let queue: Promise<unknown> = Promise.resolve();
      const send = (event: string, payload: unknown) => {
        queue = queue.then(() => stream.writeSSE({ event, data: JSON.stringify(payload) })).catch(() => undefined);
      };
      const emit = (e: AgentEvent) => send(e.type, e.type === 'step' ? { tool: e.tool, label: e.label } : { text: e.text });
      try {
        const result = await runAgentTurn(deps, { userId: user.id, body, signal: controller.signal, emit });
        track(result);
        send('final', payload(result));
      } catch (err) {
        if (!(err instanceof TurnAbortedError)) log.error('agent_turn_failed', { err, userId: user.id });
        send('error', agentErrorBody(err).error);
      } finally {
        await queue;
      }
    });
  });

  router.post('/feedback', rateLimit('WRITE_LIMITER'), limitBody(FEEDBACK_BODY_LIMIT_BYTES), validate('json', feedbackRequestSchema), async (c) => {
    const user = currentUser(c);
    const body = c.req.valid('json');
    await saveFeedback(getDb(c), user.id, { turnId: body.turn_id.toLowerCase(), rating: body.rating, comment: body.comment?.trim() || null });
    return c.json({ ok: true });
  });

  return router;
}

/** Mounted at `/agent`: `POST /agent/chat` (JSON or SSE) and `POST /agent/feedback`. */
export const agentRoutes = createAgentRoutes();
