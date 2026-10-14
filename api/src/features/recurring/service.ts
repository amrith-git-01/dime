import { decimalToCents, formatCents } from '../../core/decimal';
import { BadRequestError, ConflictError, NotFoundError } from '../../core/errors';
import { isoUtc } from '../../core/timestamps';
import { dateKey, localDate, parseTimezone } from '../../core/timezone';
import { unprocessable } from '../../core/validation';
import { fetchMetaByIds, listVisibleIdName } from '../categories/repository';
import type { CategoryMeta } from '../categories/repository';
import type { TxContext } from '../transactions/service';
import { postOccurrence } from './poster';
import type { Later } from './poster';
import * as repo from './repository';
import { currentPeriodPassed, dueInPeriod, firstDueFrom, periodRange } from './schedule';
import type { Schedule } from './schedule';
import type {
  OccurrenceStatus,
  RecurringCreateBody,
  RecurringKind,
  RecurringListResponse,
  RecurringMonthResponse,
  RecurringOccurrence,
  RecurringPatchBody,
  RecurringResponse,
  RecurringRow,
} from './schemas';

const NOT_FOUND = 'Recurring item not found.';

/** Cents per month: monthly items as they are, yearly ones divided by 12 (rounded to the cent). */
const monthlyCents = (row: Pick<RecurringRow, 'amount' | 'cadence'>): number => (row.cadence === 'yearly' ? Math.round(row.amount / 12) : row.amount);

function toResponse(row: RecurringRow, meta: Map<string, CategoryMeta>): RecurringResponse {
  const cat = row.category_id ? meta.get(row.category_id.toLowerCase()) : undefined;
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    amount: formatCents(row.amount),
    category_id: row.category_id,
    category: cat?.name?.trim() || null,
    category_icon_name: cat?.icon_name ?? null,
    category_color: cat?.color ?? null,
    cadence: row.cadence,
    day_of_month: row.day_of_month,
    month_of_year: row.month_of_year,
    timezone: row.timezone,
    next_due_date: row.next_due_date,
    active: row.active === 1,
    note: row.note,
    monthly_equivalent: formatCents(monthlyCents(row)),
    created_at: isoUtc(row.created_at),
    updated_at: isoUtc(row.updated_at),
  };
}

async function present(ctx: TxContext, rows: readonly RecurringRow[]): Promise<RecurringResponse[]> {
  const ids = [...new Set(rows.flatMap((r) => (r.category_id ? [r.category_id] : [])))];
  const meta = await fetchMetaByIds(ctx.db, ids, ctx.userId);
  return rows.map((r) => toResponse(r, meta));
}

export async function listRecurring(ctx: TxContext, kind?: 'income' | 'subscription'): Promise<RecurringListResponse> {
  const rows = await repo.listForUser(ctx.db, ctx.userId);
  const total = (k: string) => rows.filter((r) => r.kind === k && r.active === 1).reduce((sum, r) => sum + monthlyCents(r), 0);
  return {
    items: await present(ctx, kind ? rows.filter((r) => r.kind === kind) : rows),
    summary: { monthly_income_total: formatCents(total('income')), monthly_subscriptions_total: formatCents(total('subscription')) },
  };
}

/** The category scope each kind of item uses. */
const SCOPE_OF_KIND = { subscription: 'recurring_expense', income: 'recurring_income' } as const;
/** Used when no category is given (and for an item that would otherwise have none). */
const DEFAULT_CATEGORY_OF_KIND = { subscription: 'Other expense', income: 'Salary' } as const;
/** An old app build may still send an everyday spending category: it maps to the nearest recurring one (same as migration 0007). */
const LEGACY_SUBSCRIPTION_CATEGORY: Readonly<Record<string, string>> = {
  'bills & utilities': 'Utilities',
  education: 'Fees & tuition',
  entertainment: 'Subscriptions',
};

/**
 * The category id to store for an item of `kind`. It must be visible to the user and in the kind's recurring scope
 * (subscription: recurring_expense, income: recurring_income); a missing one becomes the kind's default and an everyday
 * spending category (old app builds) is mapped to the nearest recurring one. Anything else is a client error.
 */
async function resolveItemCategory(ctx: TxContext, kind: RecurringKind, categoryId: string | null | undefined): Promise<string> {
  const visible = await listVisibleIdName(ctx.db, ctx.userId);
  const scope = SCOPE_OF_KIND[kind];
  const named = (name: string) => visible.find((c) => c.scope === scope && c.name === name);
  const fallback = () => {
    const hit = named(DEFAULT_CATEGORY_OF_KIND[kind]);
    if (!hit) throw new BadRequestError('Category not found.');
    return String(hit.id).toLowerCase();
  };
  if (!categoryId) return fallback();

  const id = categoryId.toLowerCase();
  const found = visible.find((c) => String(c.id).toLowerCase() === id);
  if (!found) throw new BadRequestError('Category not found.');
  if (found.scope === scope) return id;
  if (found.scope === 'spend') {
    const mapped = kind === 'income' ? 'Salary' : LEGACY_SUBSCRIPTION_CATEGORY[found.name.trim().toLowerCase()];
    const hit = mapped ? named(mapped) : undefined;
    return hit ? String(hit.id).toLowerCase() : fallback();
  }
  throw new BadRequestError(kind === 'income' ? 'Choose an income category.' : 'Choose a recurring expense category.');
}

export async function createRecurring(ctx: TxContext, body: RecurringCreateBody, later: Later, nowMs: number = Date.now()): Promise<RecurringResponse> {
  if ((await repo.countForUser(ctx.db, ctx.userId)) >= repo.MAX_ITEMS_PER_USER) {
    throw new ConflictError(`You can have up to ${repo.MAX_ITEMS_PER_USER} recurring items.`);
  }
  const tz = parseTimezone(body.timezone);
  const schedule: Schedule = {
    cadence: body.cadence,
    day_of_month: body.day_of_month,
    month_of_year: body.cadence === 'yearly' ? (body.month_of_year ?? null) : null,
  };
  const categoryId = await resolveItemCategory(ctx, body.kind, body.category_id);

  // Never backfill: the first posting is this period's due date if it is still ahead (or today), else the next period's.
  const row = await repo.insert(ctx.db, {
    user_id: ctx.userId,
    kind: body.kind,
    name: body.name,
    amount: decimalToCents(body.amount),
    category_id: categoryId,
    cadence: schedule.cadence,
    day_of_month: schedule.day_of_month,
    month_of_year: schedule.month_of_year,
    timezone: tz,
    next_due_date: dateKey(firstDueFrom(schedule, tz, nowMs)),
    active: body.active ? 1 : 0,
    note: body.note ?? null,
  });

  // The due day of this period already passed and the user asked for it: post it now. `next_due_date` is already the next period.
  if (body.active && body.post_current_period && currentPeriodPassed(schedule, tz, nowMs)) {
    const today = localDate(tz, nowMs);
    try {
      await postOccurrence(ctx, row, dueInPeriod(schedule, today.year, today.month), later);
    } catch (err) {
      await repo.remove(ctx.db, ctx.userId, row.id); // no half-created item: the client can retry
      throw err;
    }
  }
  return (await present(ctx, [row]))[0] as RecurringResponse;
}

export async function updateRecurring(ctx: TxContext, id: string, body: RecurringPatchBody, nowMs: number = Date.now()): Promise<RecurringResponse> {
  const existing = await repo.fetchForUser(ctx.db, ctx.userId, id);
  if (!existing) throw new NotFoundError(NOT_FOUND);

  const cadence = body.cadence ?? existing.cadence;
  const month = cadence === 'yearly' ? (body.month_of_year !== undefined ? body.month_of_year : existing.month_of_year) : null;
  if (cadence === 'yearly' && month === null) {
    return unprocessable([{ type: 'missing', loc: ['body', 'month_of_year'], msg: 'Field required' }]);
  }
  const tz = body.timezone === undefined ? existing.timezone : parseTimezone(body.timezone);
  const categoryId = body.category_id === undefined ? existing.category_id : await resolveItemCategory(ctx, existing.kind, body.category_id);

  const merged: RecurringRow = {
    ...existing,
    name: body.name ?? existing.name,
    amount: body.amount === undefined ? existing.amount : decimalToCents(body.amount),
    category_id: categoryId,
    cadence,
    day_of_month: body.day_of_month ?? existing.day_of_month,
    month_of_year: month,
    timezone: tz,
    active: body.active === undefined ? existing.active : body.active ? 1 : 0,
    note: body.note === undefined ? existing.note : body.note,
  };

  // Amount, name, category and note only matter at the next posting. A new schedule (or resuming) re-plans from today
  // forward; if this period was already posted, the plan starts at the next one, so a changed day never double-posts.
  const replan =
    merged.cadence !== existing.cadence ||
    merged.day_of_month !== existing.day_of_month ||
    merged.month_of_year !== existing.month_of_year ||
    merged.timezone !== existing.timezone ||
    (merged.active === 1 && existing.active === 0);
  if (replan) {
    const today = localDate(tz, nowMs);
    const posted = await repo.hasPostedIn(ctx.db, id, periodRange(merged, tz, dueInPeriod(merged, today.year, today.month)));
    merged.next_due_date = dateKey(firstDueFrom(merged, tz, nowMs, posted));
  }

  const row = await repo.update(ctx.db, ctx.userId, merged);
  if (!row) throw new NotFoundError(NOT_FOUND);
  return (await present(ctx, [row]))[0] as RecurringResponse;
}

const DAY_MS = 86_400_000;

/**
 * Every occurrence of the user's recurring items that falls in the calendar month `year`/`month`, with its status.
 * Posted rows come from ONE query (the month widened by a day, so any timezone's local month fits) and are matched per
 * item to that item's own local period. A deleted posting is "skipped" (the poster treats the period as done, so it is
 * not posted again). An unposted occurrence is "upcoming" only for an active item whose schedule has not moved past it
 * (never a backfill of dates before the item existed); a paused, unposted one is left out.
 */
export async function monthOccurrences(ctx: TxContext, year: number, month: number): Promise<RecurringMonthResponse> {
  const first = Date.UTC(year, month - 1, 1);
  const after = Date.UTC(year, month, 1);
  const [items, posted] = await Promise.all([
    repo.listForUser(ctx.db, ctx.userId),
    repo.listPostedIn(ctx.db, ctx.userId, { from: new Date(first - DAY_MS).toISOString(), to: new Date(after + DAY_MS).toISOString() }),
  ]);
  const inMonth = items.filter((item) => item.cadence === 'monthly' || item.month_of_year === month);
  const meta = await fetchMetaByIds(ctx.db, [...new Set(inMonth.flatMap((r) => (r.category_id ? [r.category_id] : [])))], ctx.userId);

  const out: RecurringOccurrence[] = [];
  const totals = { expensePaid: 0, expenseUpcoming: 0, incomeReceived: 0, incomeUpcoming: 0 };
  for (const item of inMonth) {
    const due = dueInPeriod(item, year, month);
    const dueKey = dateKey(due);
    const period = periodRange(item, item.timezone, due);
    const rows = posted.filter((p) => p.recurring_item_id === item.id && p.transaction_at >= period.from && p.transaction_at < period.to);
    const live = rows.find((p) => p.deleted_at === null);
    let status: OccurrenceStatus;
    if (live) status = 'paid';
    else if (rows.length > 0) status = 'skipped';
    else if (item.active === 1 && dueKey >= item.next_due_date) status = 'upcoming';
    else continue;

    const cat = item.category_id ? meta.get(item.category_id.toLowerCase()) : undefined;
    const occurrence: RecurringOccurrence = {
      id: item.id,
      kind: item.kind,
      name: item.name,
      amount: formatCents(item.amount),
      category: cat ? { id: cat.id, name: cat.name.trim(), icon_name: cat.icon_name, color: cat.color, scope: cat.scope } : null,
      due_date: dueKey,
      status,
    };
    if (live) {
      occurrence.transaction_id = live.id;
      occurrence.posted_amount = formatCents(live.amount);
    }
    out.push(occurrence);
    const isIncome = item.kind === 'income';
    if (status === 'paid') totals[isIncome ? 'incomeReceived' : 'expensePaid'] += live?.amount ?? 0;
    else if (status === 'upcoming') totals[isIncome ? 'incomeUpcoming' : 'expenseUpcoming'] += item.amount;
  }
  out.sort((a, b) => (a.due_date === b.due_date ? a.name.localeCompare(b.name) : a.due_date < b.due_date ? -1 : 1));
  return {
    year,
    month,
    items: out,
    totals: {
      fixed_expense_paid: formatCents(totals.expensePaid),
      fixed_expense_upcoming: formatCents(totals.expenseUpcoming),
      fixed_income_received: formatCents(totals.incomeReceived),
      fixed_income_upcoming: formatCents(totals.incomeUpcoming),
    },
  };
}

export async function deleteRecurring(ctx: TxContext, id: string): Promise<void> {
  if (!(await repo.remove(ctx.db, ctx.userId, id))) throw new NotFoundError(NOT_FOUND);
}
