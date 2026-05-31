import { memo } from "react";

import type { NotificationInboxFilter } from "@/features/notifications/types";

import { NotificationsCenteredEmpty } from "./NotificationsCenteredEmpty";

const COPY: Record<NotificationInboxFilter, { title: string; message: string }> =
  {
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

export type NotificationsFilterEmptyStateProps = {
  filter: NotificationInboxFilter;
};

export const NotificationsFilterEmptyState = memo(
  function NotificationsFilterEmptyState({
    filter,
  }: NotificationsFilterEmptyStateProps) {
    const { title, message } = COPY[filter];

    return <NotificationsCenteredEmpty title={title} message={message} />;
  },
);
