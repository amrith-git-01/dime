import type { Db } from '../../core/db';
import { dateKey, shiftMonth } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';
import { daysBetween, parseIsoDate } from '../agent/dates';
import { normalizeCounterparty } from '../transactions/dedupe';
import { findByOccurrence } from '../transactions/repository';
import * as repo from './repository';
import { dueInPeriod } from './schedule';
import type { RecurringRow } from './schemas';

/**
 * "Is this manual entry one of my recurring items?" (docs/MONEY-MODEL-FIX-PLAN.md R4): a manual row near an item's due date, for
 * the same payee or about the same amount, is offered to the client as `possible_recurring`; `POST /recurring/:id/link` then makes
 * it that occurrence, and the poster skips an occurrence that already has a live row.
 */

/** Days either side of the due date a manual entry may be and still look like the occurrence. */
export const MATCH_WINDOW_DAYS = 5;
/** Amount tolerance: 2% of the item's amount. */
const AMOUNT_TOLERANCE_DENOMINATOR = 50;

export interface PossibleRecurring {
  item_id: string;
  /** The period's due date, `YYYY-MM-DD`: what to send back to the link endpoint. */
  occurrence: string;
}

const KIND_OF_TYPE = { debit: 'subscription', credit: 'income' } as const;

/** The due dates of `item` that could be within the window of `day`: this period and the neighbours (a yearly item: this year and the ones either side). */
function nearbyDueDates(item: RecurringRow, day: LocalDate): LocalDate[] {
  if (item.cadence === 'yearly') return [-1, 0, 1].map((delta) => dueInPeriod(item, day.year + delta, item.month_of_year ?? 1));
  return [-1, 0, 1].map((delta) => {
    const ym = shiftMonth({ year: day.year, month: day.month }, delta);
    return dueInPeriod(item, ym.year, ym.month);
  });
}

/** The recurring occurrence a manual entry most plausibly is, or null. */
export async function findRecurringMatch(
  db: Db,
  userId: string,
  tx: { type: 'debit' | 'credit'; amountCents: number; payeeKey: string; localDate: string },
): Promise<PossibleRecurring | null> {
  const day = parseIsoDate(tx.localDate);
  if (!day) return null;
  const items = (await repo.listForUser(db, userId)).filter((item) => item.active === 1 && item.kind === KIND_OF_TYPE[tx.type]);

  const candidates: { item: RecurringRow; occurrence: string; distance: number }[] = [];
  for (const item of items) {
    const samePayee = normalizeCounterparty(item.name) === tx.payeeKey;
    const sameAmount = Math.abs(tx.amountCents - item.amount) * AMOUNT_TOLERANCE_DENOMINATOR <= item.amount;
    if (!samePayee && !sameAmount) continue;
    for (const due of nearbyDueDates(item, day)) {
      const distance = Math.abs(daysBetween(day, due));
      if (distance <= MATCH_WINDOW_DAYS) candidates.push({ item, occurrence: dateKey(due), distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  for (const c of candidates) {
    // An occurrence that already has a live row (posted by the cron, or linked before) is taken.
    if (!(await findByOccurrence(db, userId, c.item.id, c.occurrence))) return { item_id: c.item.id, occurrence: c.occurrence };
  }
  return null;
}
