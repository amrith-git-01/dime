import type { QueryClient } from "@tanstack/react-query";

import { reminderQueryKeys } from "../queryKeys";

/**
 * After a reminder is created, edited, completed, skipped or deleted: every list (Home's Upcoming
 * card reads the open one). Completing does not touch transactions, so nothing else is refreshed.
 */
export function invalidateReminderQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: reminderQueryKeys.all });
}
