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
import type { RecurringCreateBody, RecurringListResponse, RecurringPatchBody, RecurringResponse, RecurringRow } from './schemas';

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

/** A category the user can see (system or own); anything else is a client error. */
async function assertVisibleCategory(ctx: TxContext, categoryId: string): Promise<string> {
  const id = categoryId.toLowerCase();
  const visible = await listVisibleIdName(ctx.db, ctx.userId);
  if (!visible.some((c) => String(c.id).toLowerCase() === id)) throw new BadRequestError('Category not found.');
  return id;
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
  const [explicit, income] = await Promise.all([
    body.category_id ? assertVisibleCategory(ctx, body.category_id) : Promise.resolve(null),
    body.kind === 'income' && !body.category_id ? repo.incomeCategoryId(ctx.db) : Promise.resolve(null),
  ]);

  // Never backfill: the first posting is this period's due date if it is still ahead (or today), else the next period's.
  const row = await repo.insert(ctx.db, {
    user_id: ctx.userId,
    kind: body.kind,
    name: body.name,
    amount: decimalToCents(body.amount),
    category_id: explicit ?? income,
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
  const categoryId =
    body.category_id === undefined ? existing.category_id : body.category_id === null ? null : await assertVisibleCategory(ctx, body.category_id);

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

export async function deleteRecurring(ctx: TxContext, id: string): Promise<void> {
  if (!(await repo.remove(ctx.db, ctx.userId, id))) throw new NotFoundError(NOT_FOUND);
}
