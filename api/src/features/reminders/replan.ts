import { batch, chunks } from '../../core/db';
import type { Db } from '../../core/db';
import * as recurringRepo from '../recurring/repository';
import type { UserSettings } from '../user-settings/snapshot';
import { nextFireIso, nextRemindIso, reminderInput } from './plan';
import * as repo from './repository';

/** Statements per `db.batch` call. */
const BATCH_SIZE = 100;

/**
 * After the user changed a reminder preference (time, lead days, quiet hours, ...): recompute the next instant of their open
 * reminders and of their active recurring items with lead-day reminders from the CURRENT settings, so the change applies at
 * once instead of when each row next fires. `fired_through` is kept, so nothing already sent is sent again. One read per table
 * and then batched updates (only rows whose instant changed).
 */
export async function replanUserReminders(db: Db, userId: string, settings: UserSettings, nowMs: number): Promise<{ reminders: number; recurring: number }> {
  const [reminders, items] = await Promise.all([repo.listOpenForUser(db, userId), recurringRepo.listRemindableForUser(db, userId)]);
  const reminderStatements = [];
  for (const r of reminders) {
    const after = Math.max(r.fired_through ? Date.parse(r.fired_through) : -Infinity, nowMs);
    const next = nextFireIso(reminderInput(r, settings), after, r.cadence !== 'none');
    if (next !== r.next_fire_at) reminderStatements.push(repo.setNextFireStatement(db, userId, r.id, next));
  }
  const recurringStatements = [];
  for (const item of items) {
    const next = nextRemindIso(item, settings, nowMs);
    if (next !== item.next_remind_at) recurringStatements.push(recurringRepo.setNextRemindStatement(db, userId, item.id, next));
  }
  for (const group of chunks([...reminderStatements, ...recurringStatements], BATCH_SIZE)) await batch(db, group);
  return { reminders: reminderStatements.length, recurring: recurringStatements.length };
}
