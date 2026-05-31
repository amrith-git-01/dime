import type { NotificationInboxFilter } from "@/features/notifications/types";

export const NOTIFICATION_INBOX_EMPTY = {
  title: "No notifications yet",
  message: "Capture and budget alerts will show up here.",
} as const;

export const NOTIFICATION_FILTER_EMPTY: Record<
  NotificationInboxFilter,
  { title: string; message: string }
> = {
  all: {
    title: "No notifications",
    message: "You're all caught up.",
  },
  unread: {
    title: "No unread",
    message: "You're all caught up.",
  },
  read: {
    title: "No read items",
    message: "Open a notification to see it here.",
  },
};
