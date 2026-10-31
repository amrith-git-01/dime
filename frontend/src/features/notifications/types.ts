/**
 * `unknown` is never sent by the server: it is what a kind this build does not know becomes
 * (a newer server, an old cached row), so a new kind can show up without breaking the inbox.
 */
export type NotificationKind =
  | "transaction_auto"
  | "budget_threshold"
  | "capture_failed"
  | "report_ready"
  | "reminder_due"
  | "unknown";

export type NotificationAction =
  | { type: "transaction_detail"; transactionId: string }
  | { type: "home" }
  | { type: "manual_add" }
  | { type: "report"; periodKey: string }
  /** `reminderId` is null for a recurring item's lead reminder: the list opens without a highlight. */
  | { type: "reminder"; reminderId: string | null }
  | { type: "none" };

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  action: NotificationAction;
};

export type NotificationDateGroup = {
  key: string;
  title: string;
  items: AppNotification[];
};

export type NotificationInboxFilter = "all" | "unread" | "read";
