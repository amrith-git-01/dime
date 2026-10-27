import * as z from 'zod';

import { uuidString } from '../../core/validation';

export const NOTIFICATION_COLUMNS = 'id,kind,title,body,created_at,read_at,action_type,action_transaction_id,action_period_key';

const CURSOR_ID = /^[0-9a-fA-F-]{8,40}$/;

export const listQuerySchema = z.object({
  filter: z.enum(['all', 'unread', 'read']).default('all'),
  /** C4: page size. */
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** C4: opaque cursor, the previous page's `next_cursor` (`<created_at ISO>|<id>`; a bare ISO timestamp is still accepted). */
  before: z
    .string()
    .optional()
    .transform((value, ctx): string | undefined => {
      if (value === undefined) return undefined;
      // A literal `+` in a query string arrives as a space.
      const normalized = value.trim().replace(' ', '+');
      const [time = '', id, ...extra] = normalized.split('|');
      if (Number.isNaN(Date.parse(time)) || extra.length > 0 || (id !== undefined && !CURSOR_ID.test(id))) {
        ctx.addIssue({
          code: 'custom',
          message: 'Input should be a valid datetime',
          params: { type: 'datetime_parsing' },
        });
        return z.NEVER;
      }
      return normalized;
    }),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
export type NotificationFilter = ListQuery['filter'];

export const notificationIdParamSchema = z.object({ id: uuidString });

export interface NotificationRow {
  id: string;
  kind: 'transaction_auto' | 'budget_threshold' | 'capture_failed' | 'report_ready';
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  action_type: 'transaction_detail' | 'home' | 'manual_add' | 'report' | 'none' | null;
  action_transaction_id: string | null;
  /** `YYYY-MM` of the report to open; set only for `report` notifications. */
  action_period_key: string | null;
}

export interface NotificationResponse {
  id: string;
  kind: NotificationRow['kind'];
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  /** `period_key` is present only on `report` actions, so every other notification keeps its old shape. */
  action: { type: NonNullable<NotificationRow['action_type']>; transaction_id: string | null; period_key?: string };
}

export interface NotificationListResponse {
  items: NotificationResponse[];
  /** C4: `<created_at>|<id>` of the last item when more pages exist, otherwise null. */
  next_cursor: string | null;
}

/** Row accepted by `insertDeduped`; `dedupe_key` + `user_id` are mandatory. */
export interface NewNotification {
  user_id: string;
  kind: NotificationRow['kind'];
  title: string;
  body: string;
  action_type: NonNullable<NotificationRow['action_type']>;
  action_transaction_id: string | null;
  action_period_key?: string | null;
  dedupe_key: string;
}
