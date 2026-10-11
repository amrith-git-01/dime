import { first, run } from '../../core/db';
import type { Db } from '../../core/db';
import { TooManyRequestsError } from '../../core/errors';
import { PermanentAiError } from './errors';

/**
 * Workers AI cost cap. Workers AI is free up to 10,000 neurons per UTC day for the whole account and
 * billed above that, so the app counts its own spend (voice + receipt OCR only; DeepSeek parsing
 * and the agent are not Workers AI) and stops before the free allowance:
 * - at upload (`claimUpload`): 429 + Retry-After, nothing stored or queued;
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

/** Per-user daily limits apply per kind; the column that counts each. */
export type CaptureKind = 'receipt' | 'voice';
const KIND_COLUMN: Record<CaptureKind, 'receipts' | 'voices'> = { receipt: 'receipts', voice: 'voices' };

export interface UserCaptureCounts {
  receipts: number;
  voices: number;
}

export async function userCapturesToday(db: Db, userId: string, nowMs: number): Promise<UserCaptureCounts> {
  const row = await first<UserCaptureCounts>(db, 'SELECT receipts, voices FROM ai_user_usage WHERE user_id = ? AND day = ?', [userId, utcDay(nowMs)]);
  return { receipts: row?.receipts ?? 0, voices: row?.voices ?? 0 };
}

/**
 * Counts one accepted upload of `kind` for this user today, atomically: the upsert only increments while the
 * counter is below `limit`, so concurrent requests cannot pass it. `false` = the limit is used up.
 */
export async function claimCapture(db: Db, userId: string, kind: CaptureKind, nowMs: number, limit: number): Promise<boolean> {
  if (limit <= 0) return false;
  const col = KIND_COLUMN[kind]; // from the fixed map above, never user input
  const row = await first<{ n: number }>(
    db,
    `INSERT INTO ai_user_usage (user_id, day, ${col}, updated_at) VALUES (?, ?, 1, ?)
     ON CONFLICT (user_id, day) DO UPDATE SET ${col} = ${col} + 1, updated_at = excluded.updated_at
     WHERE ${col} < ?
     RETURNING ${col} AS n`,
    [userId, utcDay(nowMs), new Date(nowMs).toISOString(), limit],
  );
  return row !== null;
}

/** Gives back a claim whose upload did not become a job (lost idempotency race, failed insert). Never goes below 0. */
export async function releaseCapture(db: Db, userId: string, kind: CaptureKind, nowMs: number): Promise<void> {
  const col = KIND_COLUMN[kind];
  await run(db, `UPDATE ai_user_usage SET ${col} = MAX(${col} - 1, 0) WHERE user_id = ? AND day = ?`, [userId, utcDay(nowMs)]);
}

export interface NeuronLimits {
  dailyNeuronCap: number;
  userDailyReceipts: number;
  userDailyVoice: number;
}

/** The user's daily limit for a kind of upload. */
export const limitFor = (limits: NeuronLimits, kind: CaptureKind): number => (kind === 'receipt' ? limits.userDailyReceipts : limits.userDailyVoice);

const KIND_LABEL: Record<CaptureKind, string> = { receipt: 'receipt scan', voice: 'voice capture' };

/**
 * Upload guard: 429 (+ `Retry-After` until 00:00 UTC) when today's neurons plus this capture's estimate would pass
 * the cap, or the user already used their daily uploads of this kind. On success the upload IS counted (atomic claim),
 * so the caller must `releaseCapture` if it then fails to create the job. Throws before anything is stored or queued.
 */
export async function claimUpload(
  db: Db,
  userId: string,
  kind: CaptureKind,
  limits: NeuronLimits,
  estimate: number,
  nowMs = Date.now(),
): Promise<void> {
  const retryAfter = secondsUntilUtcMidnight(nowMs);
  if ((await neuronsUsedToday(db, nowMs)) + estimate > limits.dailyNeuronCap) {
    throw new TooManyRequestsError('Scanning is paused for today. Try again tomorrow.', retryAfter);
  }
  const limit = limitFor(limits, kind);
  if (!(await claimCapture(db, userId, kind, nowMs, limit))) {
    throw new TooManyRequestsError(`You've used today's ${limit} ${KIND_LABEL[kind]}${limit === 1 ? '' : 's'}. Try again tomorrow.`, retryAfter);
  }
}

/** Consumer guard: the day may have filled up since the upload. Permanent, so the job fails with the capture-failed notification. */
export async function assertJobAllowed(db: Db, limits: NeuronLimits, estimate: number, nowMs = Date.now()): Promise<void> {
  if ((await neuronsUsedToday(db, nowMs)) + estimate > limits.dailyNeuronCap) {
    throw new PermanentAiError('Daily AI limit reached.');
  }
}
