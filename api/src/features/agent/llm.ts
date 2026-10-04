import type { ZodType } from 'zod';

import type { AppConfig } from '../../core/env';
import { log } from '../../core/logging';
import { PermanentAiError, TransientAiError } from '../ai/errors';
import { aggregateFailure, aiPost } from '../ai/http';
import { ModelOutputError, parseModelJson } from './chart';

/** One shared DeepSeek JSON-mode caller for every agent step (classify, SQL, respond). */

export type AiPostFn = typeof aiPost;

export interface LlmDeps {
  agent: AppConfig['agent'];
  apiKey: string | undefined;
  /** Overridable for tests. */
  post?: AiPostFn;
}

export interface LlmCallInput<T> {
  /** Step name for logs. */
  node: string;
  system: string;
  user: string;
  /** Turns the model's raw content into the step's value; throws `ModelOutputError` when unusable. */
  parse: (content: string) => T;
}

/** `parse` for steps whose output is exactly one JSON object matching `schema`. */
export function jsonParser<T>(schema: ZodType<T>): (content: string) => T {
  return (content) => {
    const parsed = schema.safeParse(parseModelJson(content));
    if (!parsed.success) throw new ModelOutputError('Model output does not match the expected shape.');
    return parsed.data;
  };
}

/** Every attempt answered, but never with something usable (as opposed to the provider failing). */
export class UnusableOutputError extends PermanentAiError {}

export interface LlmCallStats {
  node: string;
  model: string;
  ms: number;
  attempts: number;
}

function chatUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function contentOf(data: unknown): string {
  const choices = (data as { choices?: { message?: { content?: unknown } }[] } | null)?.choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new ModelOutputError('Model returned no content.');
  return content;
}

/** Models to try in order: the primary, then the fallback (or the primary once more for a transient/bad answer). */
function attemptPlan(agent: AppConfig['agent']): { model: string; sameModelRetry: boolean }[] {
  const plan = [{ model: agent.model, sameModelRetry: false }];
  if (agent.modelFallback && agent.modelFallback !== agent.model) plan.push({ model: agent.modelFallback, sameModelRetry: false });
  else plan.push({ model: agent.model, sameModelRetry: true });
  return plan;
}

/**
 * Ask the agent model for one JSON object and validate it. On a failed attempt (HTTP error, timeout,
 * empty or invalid JSON) the next model in the plan is tried. When all fail the error is a
 * `TransientAiError` if any attempt could succeed later, otherwise a `PermanentAiError`.
 */
export async function callAgentJson<T>(deps: LlmDeps, input: LlmCallInput<T>): Promise<{ value: T; stats: LlmCallStats }> {
  const { agent, apiKey } = deps;
  if (!apiKey) throw new PermanentAiError('DEEPSEEK_API_KEY is missing');
  const post = deps.post ?? aiPost;
  const errors: unknown[] = [];
  const started = Date.now();
  let attempts = 0;

  for (const step of attemptPlan(agent)) {
    // A second try on the same model only helps after a transient failure or an unusable answer.
    const last = errors.at(-1);
    if (step.sameModelRetry && last instanceof PermanentAiError) break;

    attempts += 1;
    const attemptStarted = Date.now();
    try {
      const data = await post(chatUrl(agent.baseUrl), {
        upstream: 'deepseek',
        timeoutMs: agent.timeoutMs,
        headers: { authorization: `Bearer ${apiKey}` },
        json: {
          model: step.model,
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
          ...(agent.thinkingEnabled ? {} : { thinking: { type: 'disabled' } }),
        },
      });
      const value = input.parse(contentOf(data));
      return { value, stats: { node: input.node, model: step.model, ms: Date.now() - started, attempts } };
    } catch (err) {
      log.warn('agent_llm_attempt_failed', {
        node: input.node,
        model: step.model,
        ms: Date.now() - attemptStarted,
        kind: err instanceof TransientAiError ? 'transient' : err instanceof ModelOutputError ? 'bad_output' : 'permanent',
        err: String(err),
      });
      // Unusable output is worth another try (sampling differs); treat it like a transient failure.
      errors.push(err instanceof ModelOutputError ? new TransientAiError(err.message, { cause: err }) : err);
    }
  }
  if (errors.length > 0 && errors.every((e) => e instanceof TransientAiError && e.cause instanceof ModelOutputError)) {
    throw new UnusableOutputError('Agent model returned no usable output.', { cause: errors.at(-1) });
  }
  throw aggregateFailure('Agent model unavailable.', errors);
}
