import { first, fromFlag } from '../../core/db';
import type { Db } from '../../core/db';

/** What the Home "Get started" checklist ticks from data (the widget item is a device flag in the app). */
export interface OnboardingProgress {
  first_expense: boolean;
  voice_or_scan: boolean;
  budget: boolean;
  recurring: boolean;
  asked_ai: boolean;
}

interface ProgressRow {
  first_expense: number;
  voice_or_scan: number;
  budget: number;
  recurring: number;
  asked_ai: number;
}

/**
 * One statement of EXISTS probes, all scoped by ?1 (the JWT user id); each stops at its first row.
 * A recurring posting is a normal 'manual' debit with `recurring_item_id` set, so it does not count as a first expense.
 * A budget counts when the monthly amount is above zero (the row can exist with 0) or any category has a limit.
 */
const PROGRESS_SQL = `
  SELECT
    EXISTS (SELECT 1 FROM transactions WHERE user_id = ?1 AND deleted_at IS NULL AND type = 'debit' AND recurring_item_id IS NULL) AS first_expense,
    EXISTS (SELECT 1 FROM transactions WHERE user_id = ?1 AND deleted_at IS NULL AND detected_via IN ('voice', 'scan')) AS voice_or_scan,
    (EXISTS (SELECT 1 FROM budgets WHERE user_id = ?1 AND monthly_budget > 0)
      OR EXISTS (SELECT 1 FROM category_budgets WHERE user_id = ?1 AND monthly_amount > 0)) AS budget,
    EXISTS (SELECT 1 FROM recurring_items WHERE user_id = ?1) AS recurring,
    EXISTS (SELECT 1 FROM users WHERE id = ?1 AND first_agent_question_at IS NOT NULL) AS asked_ai`;

export async function onboardingProgress(db: Db, userId: string): Promise<OnboardingProgress> {
  const row = await first<ProgressRow>(db, PROGRESS_SQL, [userId]);
  return {
    first_expense: fromFlag(row?.first_expense),
    voice_or_scan: fromFlag(row?.voice_or_scan),
    budget: fromFlag(row?.budget),
    recurring: fromFlag(row?.recurring),
    asked_ai: fromFlag(row?.asked_ai),
  };
}
