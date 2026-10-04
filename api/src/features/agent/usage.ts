import { log } from '../../core/logging';
import type { DimeSupabaseClient } from '../../core/supabase';
import type { Usage } from './llm';

/**
 * Daily token budget (table `agent_usage`, one row per user and UTC day) and thumbs feedback
 * (`agent_feedback`), both written with the service role and always scoped by the JWT user id.
 * The budget is a cost guard, not a ledger: a failing read fails OPEN (the turn runs) and a failing
 * write is logged.
 */

const utcDay = (nowMs: number): string => new Date(nowMs).toISOString().slice(0, 10);

interface UsageRow {
  prompt_tokens: number | string;
  completion_tokens: number | string;
}

/** Tokens (prompt + completion) the user spent today, or null when the table could not be read. */
export async function tokensUsedToday(db: DimeSupabaseClient, userId: string, nowMs: number): Promise<number | null> {
  try {
    const { data } = await db
      .from('agent_usage')
      .select('prompt_tokens,completion_tokens')
      .eq('user_id', userId)
      .eq('day', utcDay(nowMs))
      .maybeSingle()
      .throwOnError()
      .overrideTypes<UsageRow, { merge: false }>();
    return data ? Number(data.prompt_tokens) + Number(data.completion_tokens) : 0;
  } catch (err) {
    log.warn('agent_usage_read_failed', { err: String(err) });
    return null;
  }
}

/** Atomic upsert-increment of the day's totals (`agent_usage_add`): one more turn. */
export async function recordUsage(db: DimeSupabaseClient, userId: string, nowMs: number, usage: Usage): Promise<void> {
  const res = await db.rpc('agent_usage_add', {
    p_user_id: userId,
    p_day: utcDay(nowMs),
    p_prompt_tokens: usage.promptTokens,
    p_completion_tokens: usage.completionTokens,
  });
  const error: unknown = res.error;
  if (error) log.warn('agent_usage_write_failed', { err: error });
}

/** One rating per (user, turn): rating again replaces the previous one. */
export async function saveFeedback(
  db: DimeSupabaseClient,
  userId: string,
  input: { turnId: string; rating: 'up' | 'down'; comment: string | null },
): Promise<void> {
  await db
    .from('agent_feedback')
    .upsert({ user_id: userId, turn_id: input.turnId, rating: input.rating, comment: input.comment }, { onConflict: 'user_id,turn_id' })
    .throwOnError();
}
