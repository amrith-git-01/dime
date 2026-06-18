export type NotificationKind =
  | "transaction_auto"
  | "budget_threshold"
  | "capture_failed";

export type NotificationAction =
  | { type: "transaction_detail"; transactionId: string }
  | { type: "home" }
  | { type: "manual_add" }
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
