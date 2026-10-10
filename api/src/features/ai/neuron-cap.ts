import { first, run } from '../../core/db';
import type { Db } from '../../core/db';
import { TooManyRequestsError } from '../../core/errors';
import { PermanentAiError } from './errors';

/**
 * Workers AI cost cap. Workers AI is free up to 10,000 neurons per UTC day for the whole account and
 * billed above that, so the app counts its own spend (voice + receipt OCR only; DeepSeek parsing, SMS
 * and the agent are not Workers AI) and stops before the free allowance:
 * - at upload (`assertUploadAllowed`): 429 + Retry-After, nothing stored or queued;
 * - in the queue consumer (`assertJobAllowed`): a job queued earlier fails permanently when the day is used up;
 * - after each successful AI call (`addNeurons`): one atomic upsert-increment.
 */

// ponytail: these are ESTIMATES from the published prices, used before a call and when the response has no
// usage. Recalibrate from the dashboard (Workers AI > Neurons per day): divide the day's neurons by the
// number of receipts / audio minutes processed and adjust the constants below.
// Source: https://developers.cloudflare.com/workers-ai/platform/pricing/ ($0.011 per 1,000 neurons).
/** whisper-large-v3-turbo: $0.0005 per audio minute = 46.63 neurons per minute. */
export const WHISPER_NEURONS_PER_MINUTE = 46.63;
/** Bitrate assumed when the duration is unknown. Real m4a voice notes are >= 64 kbps, so this OVER-counts minutes (safe side). */
export const ASSUMED_AUDIO_BYTES_PER_MINUTE = (32_000 / 8) * 60;
/** llama-4-scout: $0.27 / M input tokens = 24,545 neurons per M. */
export const LLAMA_INPUT_NEURONS_PER_MTOKEN = 24_545;
/** llama-4-scout: $0.85 / M output tokens = 77,273 neurons per M. */
export const LLAMA_OUTPUT_NEURONS_PER_MTOKEN = 77_273;
/** Image tokens per receipt photo: not documented for Workers AI, so a conservative guess. */
export const ESTIMATED_IMAGE_TOKENS = 1600;
/** The OCR prompt text. */
export const ESTIMATED_PROMPT_TOKENS = 400;
/** `max_tokens` of the OCR call; the estimate assumes the model uses all of it. */
export const OCR_MAX_OUTPUT_TOKENS = 2048;

export function estimateWhisperNeurons(audioBytes: number): number {
  const minutes = Math.max(1, Math.ceil(audioBytes / ASSUMED_AUDIO_BYTES_PER_MINUTE));
  return Math.ceil(minutes * WHISPER_NEURONS_PER_MINUTE);
}

export function neuronsFromTokens(promptTokens: number, completionTokens: number): number {
  return Math.ceil(
    (Math.max(promptTokens, 0) * LLAMA_INPUT_NEURONS_PER_MTOKEN + Math.max(completionTokens, 0) * LLAMA_OUTPUT_NEURONS_PER_MTOKEN) / 1_000_000,
  );
}

export function estimateOcrNeurons(): number {
  return neuronsFromTokens(ESTIMATED_IMAGE_TOKENS + ESTIMATED_PROMPT_TOKENS, OCR_MAX_OUTPUT_TOKENS);
}

export function neuronsFromAudioSeconds(seconds: number): number {
  return Math.ceil((Math.max(seconds, 0) / 60) * WHISPER_NEURONS_PER_MINUTE);
}

/** What an upload of this kind is expected to cost. `bytes` matters for voice only. */
export function estimateCaptureNeurons(kind: 'receipt' | 'voice', bytes: number): number {
  return kind === 'receipt' ? estimateOcrNeurons() : estimateWhisperNeurons(bytes);
}

// --- counters -----------------------------------------------------------------------------------

export const utcDay = (nowMs: number): string => new Date(nowMs).toISOString().slice(0, 10);

/** Seconds until the next 00:00 UTC (when the counters and Cloudflare's free allowance reset), at least 1. */
export function secondsUntilUtcMidnight(nowMs: number): number {
  const next = Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - nowMs) / 1000));
}

export async function neuronsUsedToday(db: Db, nowMs: number): Promise<number> {
  const row = await first<{ neurons: number }>(db, 'SELECT neurons FROM ai_usage WHERE day = ?', [utcDay(nowMs)]);
  return row?.neurons ?? 0;
}

/** Atomic upsert-increment of today's global total. */
export async function addNeurons(db: Db, nowMs: number, neurons: number): Promise<void> {
  const amount = Math.max(0, Math.ceil(neurons));
  if (amount === 0) return;
  await run(
    db,
    `INSERT INTO ai_usage (day, neurons, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (day) DO UPDATE SET neurons = neurons + excluded.neurons, updated_at = excluded.updated_at`,
    [utcDay(nowMs), amount, new Date(nowMs).toISOString()],
  );
}

export async function userCapturesToday(db: Db, userId: string, nowMs: number): Promise<number> {
  const row = await first<{ captures: number }>(db, 'SELECT captures FROM ai_user_usage WHERE user_id = ? AND day = ?', [userId, utcDay(nowMs)]);
  return row?.captures ?? 0;
}

/** One more accepted upload for this user today. */
export async function addUserCapture(db: Db, userId: string, nowMs: number): Promise<void> {
  await run(
    db,
    `INSERT INTO ai_user_usage (user_id, day, captures, updated_at) VALUES (?, ?, 1, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET captures = captures + 1, updated_at = excluded.updated_at`,
    [userId, utcDay(nowMs), new Date(nowMs).toISOString()],
  );
}

export interface NeuronLimits {
  dailyNeuronCap: number;
  userDailyCaptures: number;
}

/**
 * Upload guard: 429 (+ `Retry-After` until 00:00 UTC) when today's neurons plus this capture's estimate would pass
 * the cap, or the user already made their daily captures. Throws before anything is stored or queued.
 */
export async function assertUploadAllowed(
  db: Db,
  userId: string,
  limits: NeuronLimits,
  estimate: number,
  nowMs = Date.now(),
): Promise<void> {
  const [used, captures] = await Promise.all([neuronsUsedToday(db, nowMs), userCapturesToday(db, userId, nowMs)]);
  const retryAfter = secondsUntilUtcMidnight(nowMs);
  if (used + estimate > limits.dailyNeuronCap) {
    throw new TooManyRequestsError('Scanning is paused for today. Try again tomorrow.', retryAfter);
  }
  if (captures >= limits.userDailyCaptures) {
    throw new TooManyRequestsError(`You've reached today's limit of ${limits.userDailyCaptures} scans and voice notes. Try again tomorrow.`, retryAfter);
  }
}

/** Consumer guard: the day may have filled up since the upload. Permanent, so the job fails with the capture-failed notification. */
export async function assertJobAllowed(db: Db, limits: NeuronLimits, estimate: number, nowMs = Date.now()): Promise<void> {
  if ((await neuronsUsedToday(db, nowMs)) + estimate > limits.dailyNeuronCap) {
    throw new PermanentAiError('Daily AI limit reached.');
  }
}
