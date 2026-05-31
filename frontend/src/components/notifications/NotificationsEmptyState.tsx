import { memo } from "react";

import { NotificationsCenteredEmpty } from "./NotificationsCenteredEmpty";

export const NotificationsEmptyState = memo(function NotificationsEmptyState() {
  return (
    <NotificationsCenteredEmpty
      title="No notifications yet"
      message="Capture and budget alerts will show up here."
    />
  );
});
