import { Hono } from 'hono';

import { currentUser, requireAuth } from '../../core/auth';
import { limitBody } from '../../core/body-limit';
import { defer } from '../../core/background';
import { getConfig } from '../../core/env';
import type { AppBindings } from '../../core/env';
import { AppError, ServiceUnavailableError } from '../../core/errors';
import { log } from '../../core/logging';
import { rateLimit } from '../../core/rate-limit';
import { getSupabase } from '../../core/supabase';
import { validate } from '../../core/validation';
import { PermanentAiError, TransientAiError } from '../ai/errors';
import { openAgentDb } from './db';
import { chatRequestSchema } from './schemas';
import type { AgentErrorBody } from './schemas';
import { runAgentTurn, TurnTimeoutError } from './service';
import type { AgentDeps } from './service';
import { AgentDbUnavailableError } from './sql-executor';
import type { SqlClient } from './sql-executor';

/** Mounted at `/agent`: `POST /agent/chat`. */
export const agentRoutes = new Hono<AppBindings>();

agentRoutes.use(requireAuth);

const UNAVAILABLE = 'Assistant is temporarily unavailable. Try again shortly.';

/** Contract C5: a failed turn is an HTTP 200 carrying `{error: {code, message}}`. */
export function agentErrorBody(err: unknown): AgentErrorBody {
  if (err instanceof TurnTimeoutError || err instanceof TransientAiError) {
    return { error: { code: 'assistant_busy', message: 'The assistant is busy right now. Please try again in a moment.' } };
  }
  if (err instanceof PermanentAiError) {
    return { error: { code: 'assistant_error', message: 'The assistant could not answer that. Please try again.' } };
  }
  return { error: { code: 'agent_failed', message: 'Something went wrong while answering. Please try again.' } };
}

/** 4 000 chars of question + the history the app sends (it is trimmed server side): far below this. */
const CHAT_BODY_LIMIT_BYTES = 1024 * 1024;

agentRoutes.post('/chat', rateLimit('AI_LIMITER'), limitBody(CHAT_BODY_LIMIT_BYTES), validate('json', chatRequestSchema), async (c) => {
  const user = currentUser(c);
  const config = getConfig(c.env);
  let sql: SqlClient | undefined;

  const deps: AgentDeps = {
    config: config.agent,
    llm: { agent: config.agent, apiKey: config.ai.apiKey },
    openSql: async () => (sql ??= await openAgentDb(c.env)),
    supabase: () => getSupabase(c),
  };

  try {
    return c.json(await runAgentTurn(deps, user.id, c.req.valid('json')));
  } catch (err) {
    if (err instanceof AgentDbUnavailableError) {
      log.error('agent_db_unavailable', { err });
      throw new ServiceUnavailableError(UNAVAILABLE, 10);
    }
    if (err instanceof AppError) throw err; // e.g. an invalid timezone (400), a missing service key (503)
    log.error('agent_turn_failed', { err, userId: user.id });
    return c.json(agentErrorBody(err));
  } finally {
    // Hyperdrive keeps the real pool; just close this request's client without delaying the response.
    if (sql) defer(c, sql.end({ timeout: 5 }), 'agent-db-close');
  }
});
