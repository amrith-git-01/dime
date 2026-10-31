import { decimalToCents, formatCents } from '../../core/decimal';
import type { Db } from '../../core/db';
import { BadRequestError, ConflictError, NotFoundError } from '../../core/errors';
import { isoUtcOrNull } from '../../core/timestamps';
import { addDays, dateKey, localDate, startOfLocalDay } from '../../core/timezone';
import { unprocessable } from '../../core/validation';
import { parseDateKey } from '../recurring/schedule';
import { normalizedOrNull, payeeKey } from '../transactions/dedupe';
import { fetchByUserId } from '../user-settings/repository';
import { settingsFromRow } from '../user-settings/snapshot';
import type { UserSettings } from '../user-settings/snapshot';
import { nextFireIso, reminderInput } from './plan';
import * as repo from './repository';
import { advanceDue, leadCap, parseLeadDays } from './schedule';
import type {
  ReminderCompleteBody,
  ReminderCreateBody,
  ReminderListQuery,
  ReminderListResponse,
  ReminderPatchBody,
  ReminderResponse,
  ReminderRow,
  SuggestedMatch,
} from './schemas';

const NOT_FOUND = 'Reminder not found.';
const MAX_USED_TXN_IDS = 10;

function usedIds(raw: string | null): string[] {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
/** "Looks paid" window: a transaction this many days before / after the due date can match. */
const MATCH_DAYS_BEFORE = 7;
const MATCH_DAYS_AFTER = 14;

const loadSettings = async (db: Db, userId: string): Promise<UserSettings> => settingsFromRow(await fetchByUserId(db, userId));

/** Group key of a name, like a transaction's `payee_key`; null when the name is blank or has nothing alphanumeric. */
function payeeKeyOf(name: string | null): string | null {
  const normalized = name ? normalizedOrNull(name) : null;
  return normalized ? payeeKey(normalized, name) : null;
}

function toResponse(row: ReminderRow, settings: UserSettings, match: SuggestedMatch | null): ReminderResponse {
  const leadDays = parseLeadDays(row.lead_days, null);
  return {
    id: row.id,
    direction: row.direction,
    title: row.title,
    amount: row.amount === null ? null : formatCents(row.amount),
    counterparty_name: row.counterparty_name,
    upi_id: row.upi_id,
    due_date: row.due_date,
    cadence: row.cadence,
    lead_days: leadDays,
    effective_lead_days: leadDays ?? settings.reminder_default_lead_days,
    remind_time: row.remind_time,
    timezone: row.timezone,
    status: row.status,
    completed_at: isoUtcOrNull(row.completed_at),
    next_fire_at: isoUtcOrNull(row.next_fire_at),
    suggested_match: match,
  };
}

/**
 * The "looks paid" suggestion of each open reminder that has a payee and/or an amount: ONE batched query for the whole list
 * (see `repo.listMatches`) that finds, per reminder, the best live transaction of the right type (pay = debit, receive =
 * credit) inside `[due - 7 days, due + 14 days]` (local days of the reminder's timezone) whose payee and amount equal the
 * reminder's (whichever it has), the one closest to the due date.
 */
async function suggestMatches(db: Db, userId: string, rows: readonly ReminderRow[]): Promise<Map<string, SuggestedMatch>> {
  const matches = new Map<string, SuggestedMatch>();
  const open = rows.filter((r) => r.status === 'open' && (r.payee_key !== null || r.amount !== null));
  if (open.length === 0) return matches;

  const byId = new Map(open.map((r) => [r.id, r]));
  const windows: repo.MatchWindow[] = open.map((r) => {
    const due = parseDateKey(r.due_date);
    return {
      id: r.id,
      type: r.direction === 'pay' ? 'debit' : 'credit',
      from: new Date(startOfLocalDay(r.timezone, addDays(due, -MATCH_DAYS_BEFORE))).toISOString(),
      to: new Date(startOfLocalDay(r.timezone, addDays(due, MATCH_DAYS_AFTER + 1))).toISOString(),
      at: new Date(startOfLocalDay(r.timezone, due)).toISOString(),
      key: r.payee_key,
      amount: r.amount,
    };
  });
  for (const m of await repo.listMatches(db, userId, windows)) {
    const r = byId.get(m.rid);
    if (!r) continue;
    matches.set(r.id, {
      transaction_id: m.id,
      amount: formatCents(m.amount),
      display_name: m.counterparty_name?.trim() || r.title,
      date: dateKey(localDate(r.timezone, Date.parse(m.transaction_at))),
    });
  }
  return matches;
}

async function present(db: Db, userId: string, rows: readonly ReminderRow[], settings: UserSettings): Promise<ReminderResponse[]> {
  const matches = await suggestMatches(db, userId, rows);
  return rows.map((r) => toResponse(r, settings, matches.get(r.id) ?? null));
}

export async function listReminders(db: Db, userId: string, q: ReminderListQuery): Promise<ReminderListResponse> {
  const [rows, settings] = await Promise.all([repo.listForUser(db, userId, q.status, q.limit), loadSettings(db, userId)]);
  return { items: await present(db, userId, rows, settings) };
}

/** A due date more than one day behind today (in the reminder's timezone) is a mistake; one day of slack covers timezone drift. */
function rejectPastDue(dueDate: string, timezone: string, nowMs: number): void {
  if (dueDate < dateKey(addDays(localDate(timezone, nowMs), -1))) {
    unprocessable([{ type: 'value_error', loc: ['body', 'due_date'], msg: 'Value error, due_date is in the past' }]);
  }
}

const dayOf = (dueDate: string): number => parseDateKey(dueDate).day;

/** 422 when a lead day does not fit the cadence (a weekly reminder cannot be reminded a week or more ahead). */
function assertLeadDaysFit(leadDays: readonly number[] | null, cadence: ReminderRow['cadence']): void {
  const cap = leadCap(cadence);
  if (leadDays && leadDays.some((n) => n > cap)) {
    unprocessable([{ type: 'value_error', loc: ['body', 'lead_days'], msg: `Value error, lead days of a ${cadence === 'none' ? 'one-off' : cadence} reminder can be at most ${cap}` }]);
  }
}

export async function createReminder(db: Db, userId: string, body: ReminderCreateBody, nowMs: number = Date.now()): Promise<ReminderResponse> {
  if ((await repo.countForUser(db, userId)) >= repo.MAX_REMINDERS_PER_USER) {
    throw new ConflictError(`You can have up to ${repo.MAX_REMINDERS_PER_USER} reminders.`);
  }
  rejectPastDue(body.due_date, body.timezone, nowMs);
  assertLeadDaysFit(body.lead_days ?? null, body.cadence);
  const settings = await loadSettings(db, userId);
  const name = body.counterparty_name ?? null;
  const draft = {
    user_id: userId,
    direction: body.direction,
    title: body.title,
    amount: body.amount == null ? null : decimalToCents(body.amount),
    counterparty_name: name,
    payee_key: payeeKeyOf(name),
    upi_id: body.upi_id ?? null,
    due_date: body.due_date,
    cadence: body.cadence,
    anchor_day: dayOf(body.due_date),
    lead_days: body.lead_days ? JSON.stringify(body.lead_days) : null,
    remind_time: body.remind_time ?? null,
    timezone: body.timezone,
    status: 'open' as const,
    completed_at: null,
    completed_txn_id: null,
    used_txn_ids: null,
    fired_through: null,
  };
  const row = await repo.insert(db, { ...draft, next_fire_at: nextFireIso(reminderInput(draft, settings), nowMs, draft.cadence !== 'none') });
  return (await present(db, userId, [row], settings))[0] as ReminderResponse;
}

export async function updateReminder(db: Db, userId: string, id: string, body: ReminderPatchBody, nowMs: number = Date.now()): Promise<ReminderResponse> {
  const [existing, settings] = await Promise.all([repo.fetchForUser(db, userId, id), loadSettings(db, userId)]);
  if (!existing) throw new NotFoundError(NOT_FOUND);

  const timezone = body.timezone ?? existing.timezone;
  const dueDate = body.due_date ?? existing.due_date;
  if (dueDate !== existing.due_date) rejectPastDue(dueDate, timezone, nowMs);
  const name = body.counterparty_name === undefined ? existing.counterparty_name : body.counterparty_name;
  const status = body.status ?? existing.status;

  const merged: ReminderRow = {
    ...existing,
    direction: body.direction ?? existing.direction,
    title: body.title ?? existing.title,
    amount: body.amount === undefined ? existing.amount : body.amount === null ? null : decimalToCents(body.amount),
    counterparty_name: name,
    payee_key: body.counterparty_name === undefined ? existing.payee_key : payeeKeyOf(name),
    upi_id: body.upi_id === undefined ? existing.upi_id : body.upi_id,
    due_date: dueDate,
    cadence: body.cadence ?? existing.cadence,
    anchor_day: dueDate === existing.due_date ? existing.anchor_day : dayOf(dueDate),
    lead_days: body.lead_days === undefined ? existing.lead_days : body.lead_days === null ? null : JSON.stringify(body.lead_days),
    remind_time: body.remind_time === undefined ? existing.remind_time : body.remind_time,
    timezone,
    status,
  };
  // Checked against the merged reminder, so narrowing the cadence of one with long leads fails too.
  if (body.lead_days !== undefined || body.cadence !== undefined) assertLeadDaysFit(parseLeadDays(merged.lead_days, null), merged.cadence);
  if (status !== existing.status) {
    // Finishing stamps the time; reopening forgets the old completion.
    merged.completed_at = status === 'open' ? null : new Date(nowMs).toISOString();
    if (status === 'open') merged.completed_txn_id = null;
  }

  // A new date, repeat, lead days, time, timezone or status starts the occurrence over: nothing sent yet, next instant after now.
  const replan =
    merged.due_date !== existing.due_date ||
    merged.cadence !== existing.cadence ||
    merged.lead_days !== existing.lead_days ||
    merged.remind_time !== existing.remind_time ||
    merged.timezone !== existing.timezone ||
    merged.status !== existing.status;
  if (replan) {
    merged.fired_through = null;
    merged.next_fire_at = merged.status === 'open' ? nextFireIso(reminderInput(merged, settings), nowMs, merged.cadence !== 'none') : null;
  }

  const row = await repo.update(db, userId, merged);
  if (!row) throw new NotFoundError(NOT_FOUND);
  return (await present(db, userId, [row], settings))[0] as ReminderResponse;
}

export async function deleteReminder(db: Db, userId: string, id: string): Promise<void> {
  if (!(await repo.remove(db, userId, id))) throw new NotFoundError(NOT_FOUND);
}

/** The reminder moved to its next occurrence: new due date, nothing sent yet, next instant after now. */
function rolled(row: ReminderRow, settings: UserSettings, nowMs: number): ReminderRow {
  if (row.cadence === 'none') return row;
  const due = advanceDue(row.cadence, row.anchor_day, parseDateKey(row.due_date), localDate(row.timezone, nowMs));
  const next: ReminderRow = { ...row, due_date: dateKey(due), fired_through: null };
  next.next_fire_at = nextFireIso(reminderInput(next, settings), nowMs, true);
  return next;
}

/**
 * Mark paid / received. A one-off becomes `done`; a repeating one stays open and moves to its next occurrence (its
 * `completed_at` / `completed_txn_id` then describe the last completion). Completing something already finished is a no-op.
 */
export async function completeReminder(db: Db, userId: string, id: string, body: ReminderCompleteBody, nowMs: number = Date.now()): Promise<ReminderResponse> {
  const existing = await repo.fetchForUser(db, userId, id);
  if (!existing) throw new NotFoundError(NOT_FOUND);
  const settings = await loadSettings(db, userId);
  if (existing.status !== 'open') return (await present(db, userId, [existing], settings))[0] as ReminderResponse;

  const txnId = body.transaction_id ?? null;
  if (txnId !== null && !(await repo.transactionExists(db, userId, txnId))) throw new BadRequestError('Transaction not found.');

  // Remember the latest transactions used, so "looks paid" never offers them again for a later occurrence (a repeating reminder
  // is completed over and over, and the window of the next one can still contain an older payment).
  const used = txnId === null ? existing.used_txn_ids : JSON.stringify([...usedIds(existing.used_txn_ids), txnId].slice(-MAX_USED_TXN_IDS));
  const completion: ReminderRow = { ...existing, completed_at: new Date(nowMs).toISOString(), completed_txn_id: txnId, used_txn_ids: used };
  const next: ReminderRow =
    existing.cadence === 'none' ? { ...completion, status: 'done', fired_through: null, next_fire_at: null } : rolled(completion, settings, nowMs);
  const row = await repo.update(db, userId, next);
  if (!row) throw new NotFoundError(NOT_FOUND);
  return (await present(db, userId, [row], settings))[0] as ReminderResponse;
}

/** Repeating reminders only: move to the next occurrence without completing this one. */
export async function skipReminder(db: Db, userId: string, id: string, nowMs: number = Date.now()): Promise<ReminderResponse> {
  const existing = await repo.fetchForUser(db, userId, id);
  if (!existing) throw new NotFoundError(NOT_FOUND);
  if (existing.status !== 'open') throw new BadRequestError('Only open reminders can be skipped.');
  if (existing.cadence === 'none') throw new BadRequestError('Only repeating reminders can be skipped.');
  const settings = await loadSettings(db, userId);
  const row = await repo.update(db, userId, rolled(existing, settings, nowMs));
  if (!row) throw new NotFoundError(NOT_FOUND);
  return (await present(db, userId, [row], settings))[0] as ReminderResponse;
}
