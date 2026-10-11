/**
 * Live-update events, shaped like the `postgres_changes` payloads the app's cache handlers were written for:
 * `{ table, eventType, new, old }`. Rows carry the raw column names (`amount` as a decimal string, `deleted_at` set by a soft delete = an UPDATE).
 */
export type ChangeTable = 'transactions' | 'categories' | 'notifications';
export type ChangeType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface ChangeEvent {
  table: ChangeTable;
  eventType: ChangeType;
  new: Record<string, unknown>;
  /** INSERT: `{}`. UPDATE / DELETE: `{ id }` (the primary key). */
  old: Record<string, unknown>;
}

/** Sends events to one user's open sockets. Never throws; a `void` return means "scheduled in the background". */
export type Publish = (events: ChangeEvent[]) => void | Promise<void>;
/** Same, for callers that serve many users (the queue consumer). */
export type Publisher = (userId: string, events: ChangeEvent[]) => void | Promise<void>;

interface HasId {
  id: string;
}

export const inserted = (table: ChangeTable, row: HasId): ChangeEvent => ({ table, eventType: 'INSERT', new: { ...row }, old: {} });
export const updated = (table: ChangeTable, row: HasId): ChangeEvent => ({ table, eventType: 'UPDATE', new: { ...row }, old: { id: row.id } });
export const deleted = (table: ChangeTable, id: string): ChangeEvent => ({ table, eventType: 'DELETE', new: {}, old: { id } });
