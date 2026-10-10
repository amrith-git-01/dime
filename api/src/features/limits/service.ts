import type { Db } from '../../core/db';
import { estimateOcrNeurons, utcDay } from '../ai/neuron-cap';
import type { NeuronLimits } from '../ai/neuron-cap';

export interface LimitUsage {
  used: number;
  limit: number;
  remaining: number;
}

export interface LimitsResponse {
  /** Next 00:00 UTC, when every counter restarts. */
  resets_at: string;
  agent_questions: LimitUsage;
  receipt_scans: LimitUsage;
  voice_captures: LimitUsage;
  /** The account-wide Workers AI cap is used up: scans are refused for everyone until `resets_at`. */
  scanning_paused: boolean;
}

const usage = (used: number, limit: number): LimitUsage => ({ used, limit, remaining: Math.max(limit - used, 0) });

/** Next 00:00 UTC after `nowMs`. */
export const nextUtcMidnight = (nowMs: number): Date => {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
};

/** Today's counters in ONE batch (3 single-row reads). A missing row means nothing used yet. */
export async function dailyLimits(db: Db, userId: string, limits: NeuronLimits, agentQuestions: number, nowMs: number = Date.now()): Promise<LimitsResponse> {
  const day = utcDay(nowMs);
  const [neurons, captures, agent] = await db.batch([
    db.prepare('SELECT neurons AS n FROM ai_usage WHERE day = ?').bind(day),
    db.prepare('SELECT receipts, voices FROM ai_user_usage WHERE user_id = ? AND day = ?').bind(userId, day),
    db.prepare('SELECT turns AS n FROM agent_usage WHERE user_id = ? AND day = ?').bind(userId, day),
  ]);
  const neuronsUsed = Number((neurons?.results[0] as { n?: number } | undefined)?.n ?? 0);
  const cap = captures?.results[0] as { receipts?: number; voices?: number } | undefined;
  const turns = Number((agent?.results[0] as { n?: number } | undefined)?.n ?? 0);
  return {
    resets_at: nextUtcMidnight(nowMs).toISOString(),
    agent_questions: usage(turns, agentQuestions),
    receipt_scans: usage(cap?.receipts ?? 0, limits.userDailyReceipts),
    voice_captures: usage(cap?.voices ?? 0, limits.userDailyVoice),
    // A scan is the dearest capture: paused once not even one more fits (same test as the upload guard).
    scanning_paused: neuronsUsed + estimateOcrNeurons() > limits.dailyNeuronCap,
  };
}

