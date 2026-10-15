import { toCents } from '../../core/decimal';
import type { Db } from '../../core/db';
import { localDate, monthRange, parseTimezone } from '../../core/timezone';
import { fetchBudget, fetchCategoryBudget } from '../budgets/repository';
import { fetchMetaByIds } from '../categories/repository';
import { loadPeriodSummary } from '../transactions/service';
import type { PeriodSummary } from '../transactions/aggregates';
import type { UserSettings } from '../user-settings/snapshot';
import { formatInrCents } from './emitter';
import type { Emitter } from './emitter';

export interface EvaluateInput {
  userId: string;
  /** Validated or raw IANA name (validated here). */
  timezone: string;
  /** Instant of the debit that was just written. */
  transactionAtMs: number;
  categoryId?: string | null | undefined;
}

interface Threshold {
  /** `spent * 100 >= warnPct * cap` */
  warn: boolean;
  over: boolean;
}

/** Exact integer comparison of `spent / cap` with the warn ratio and with 1 (cents in, no floats). */
export function crossedThresholds(spentCents: number, capCents: number, warnPct: number): Threshold {
  return { warn: spentCents * 100 >= warnPct * capCents, over: spentCents > capCents };
}

interface ScopeMessages {
  titleWarn: string;
  titleOver: string;
  bodyWarn: string;
  bodyOver: string;
}

/**
 * Monthly and per-category budget threshold notifications after a debit. Port of backend
 * `features/notifications/budget_evaluator.py`: category first, then monthly; each scope
 * emits a "warn" notification at the user's warn percentage and an "over" one past 100%. Dedupe keys
 * make every threshold fire once per period. Intended to run in the background (`waitUntil`).
 */
export async function evaluateAfterDebit(
  db: Db,
  emitter: Emitter,
  settings: UserSettings,
  input: EvaluateInput,
): Promise<void> {
  const { userId, categoryId } = input;
  const tz = parseTimezone(input.timezone);
  const local = localDate(tz, input.transactionAtMs);
  const monthKey = `${local.year}-${String(local.month).padStart(2, '0')}`;
  const scope = { db, userId };

  // Month totals serve both the category and the monthly cap; fetch them at most once.
  let monthSummary: Promise<PeriodSummary> | undefined;
  const month = () => (monthSummary ??= loadPeriodSummary(scope, monthRange(tz, local.year, local.month)));

  const wantCategory = Boolean(categoryId) && settings.budget_category_alerts_enabled;
  const [categoryBudget, budget] = await Promise.all([
    wantCategory && categoryId ? fetchCategoryBudget(db, userId, categoryId) : Promise.resolve(null),
    fetchBudget(db, userId),
  ]);

  if (wantCategory && categoryId && categoryBudget) {
    const cap = toCents(categoryBudget.monthly_amount ?? 0);
    if (cap > 0) {
      const [summary, meta] = await Promise.all([month(), fetchMetaByIds(db, [categoryId], userId)]);
      const rawName = meta.get(categoryId.toLowerCase())?.name;
      const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : 'Category';
      const spent = summary.debitByCategory.get(categoryId) ?? summary.debitByCategory.get(categoryId.toLowerCase()) ?? 0;
      const warnPct = settings.budget_category_warn_pct;
      await emitScope({
        spent,
        cap,
        warnPct,
        messages: {
          titleWarn: `${warnPct}% of ${name} budget used`,
          titleOver: `${name} budget exceeded`,
          bodyWarn: `You've spent ${formatInrCents(spent)} of ${formatInrCents(cap)} on ${name} this month.`,
          bodyOver: `You're ${formatInrCents(spent - cap)} over your ${formatInrCents(cap)} ${name} budget this month.`,
        },
        emit: (threshold, title, body) => emitter.categoryBudgetThreshold({ categoryId, periodKey: monthKey, threshold, title, body }),
      });
    }
  }

  if (!budget) return;

  const monthlyCap = toCents(budget.monthly_budget ?? 0);
  if (monthlyCap > 0 && settings.budget_monthly_alerts_enabled) {
    const spent = (await month()).debitCents;
    const warnPct = settings.budget_monthly_warn_pct;
    await emitScope({
      spent,
      cap: monthlyCap,
      warnPct,
      messages: {
        titleWarn: `${warnPct}% of monthly budget used`,
        titleOver: 'Monthly budget exceeded',
        bodyWarn: `You've spent ${formatInrCents(spent)} of ${formatInrCents(monthlyCap)} this month.`,
        bodyOver: `You're ${formatInrCents(spent - monthlyCap)} over your ${formatInrCents(monthlyCap)} monthly budget.`,
      },
      emit: (threshold, title, body) => emitter.budgetThreshold({ scope: 'monthly', periodKey: monthKey, threshold, title, body }),
    });
  }
}

async function emitScope(input: {
  spent: number;
  cap: number;
  warnPct: number;
  messages: ScopeMessages;
  emit: (threshold: number, title: string, body: string) => Promise<void>;
}): Promise<void> {
  const { warn, over } = crossedThresholds(input.spent, input.cap, input.warnPct);
  // One debit can cross both thresholds at once: only the highest one is worth a notification.
  if (over) await input.emit(100, input.messages.titleOver, input.messages.bodyOver);
  else if (warn) await input.emit(input.warnPct, input.messages.titleWarn, input.messages.bodyWarn);
}
