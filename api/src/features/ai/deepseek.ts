import type { AppConfig } from '../../core/env';
import { log } from '../../core/logging';
import { PermanentAiError, TransientAiError } from './errors';
import { aggregateFailure, aiPost } from './http';
import { ModelOutputError, parseModelOutput } from './parse-output';
import type { CategoryOption, ParsedExpense } from './parse-output';
import { buildParsePrompt } from './prompts';
import type { ParseMode } from './prompts';

export interface ModelCandidate {
  provider: string;
  model: string;
}

/** `deepseek:model-a,deepseek:model-b` (the `AI_PARSE_FALLBACK` chain); empty falls back to `AI_MODEL`. */
export function parseCandidates(config: AppConfig['ai']): ModelCandidate[] {
  const chain = config.parseFallback.trim() || `deepseek:${config.model}`;
  const candidates: ModelCandidate[] = [];
  for (const rawItem of chain.split(',')) {
    const item = rawItem.trim();
    if (!item) continue;
    const at = item.indexOf(':');
    const provider = at < 0 ? '' : item.slice(0, at).trim().toLowerCase();
    const model = at < 0 ? '' : item.slice(at + 1).trim();
    if (!provider || !model) throw new PermanentAiError(`Invalid fallback chain entry: '${item}'`);
    if (provider !== 'deepseek') throw new PermanentAiError(`Unsupported parse provider '${provider}': only deepseek is allowed`);
    candidates.push({ provider, model });
  }
  if (candidates.length === 0) throw new PermanentAiError('No DeepSeek parse candidates configured');
  return candidates;
}

async function callDeepSeek(config: AppConfig['ai'], model: string, prompt: string, timeoutMs: number): Promise<string> {
  if (!config.apiKey) throw new PermanentAiError('DEEPSEEK_API_KEY is missing');
  const data = await aiPost(config.baseUrl, {
    upstream: 'deepseek',
    timeoutMs,
    headers: { authorization: `Bearer ${config.apiKey}` },
    json: {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temperature,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
    },
  });
  const choices = (data as { choices?: { message?: { content?: unknown } }[] } | null)?.choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new PermanentAiError('deepseek response missing content.');
  return content;
}

export interface ParseInput {
  mode: ParseMode;
  /** OCR text, transcript or SMS body. */
  text: string;
  allowedCategories: readonly string[];
  categoryOptions: readonly CategoryOption[];
}

/**
 * Parse with the DeepSeek model chain: each candidate gets an equal share of `AI_TIMEOUT_SECONDS`;
 * a failure (HTTP error, timeout, unusable JSON) moves on to the next model. When every candidate
 * fails the error is transient if any attempt could succeed on a later try, permanent otherwise.
 */
export async function parseWithFallback(config: AppConfig['ai'], input: ParseInput): Promise<ParsedExpense> {
  const candidates = parseCandidates(config);
  const perCandidateMs = config.timeoutMs / candidates.length;
  const prompt = buildParsePrompt(input.mode, input.text, input.allowedCategories);
  const errors: unknown[] = [];

  for (const candidate of candidates) {
    const started = Date.now();
    try {
      const raw = await callDeepSeek(config, candidate.model, prompt, perCandidateMs);
      const parsed = parseModelOutput(raw, {
        mode: input.mode,
        model: candidate.model,
        allowedCategories: input.allowedCategories,
        categoryOptions: input.categoryOptions,
      });
      log.info('ai_parse_ok', { mode: input.mode, model: candidate.model, elapsedMs: Date.now() - started, confidence: parsed.confidence });
      return parsed;
    } catch (err) {
      const kind = err instanceof TransientAiError ? 'transient' : err instanceof ModelOutputError ? 'bad_output' : 'permanent';
      log.warn('ai_parse_candidate_failed', { mode: input.mode, model: candidate.model, kind, elapsedMs: Date.now() - started, err: String(err) });
      errors.push(err);
    }
  }
  log.error('ai_parse_all_candidates_failed', { mode: input.mode, errors: errors.map(String) });
  throw aggregateFailure('AI_PARSE_UNAVAILABLE', errors);
}
