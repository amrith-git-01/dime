import { useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { REMINDER_LIST_STALE_MS } from "@/lib/queryDefaults";

import { fetchReminders, mapReminders } from "../api/remindersApi";
import { reminderQueryKeys } from "../queryKeys";
import type { Reminder, ReminderListStatus } from "../types";

/** Runs on whatever is cached, persisted rows included: a row that is not usable is dropped. */
const selectList = (data: Reminder[]) => mapReminders(data);

/** The user's reminders: `open` (default), `done` (done and dismissed) or `all`. */
export function useRemindersQuery(
  status: ReminderListStatus = "open",
  options?: { enabled?: boolean },
) {
  const { userId } = useSessionUserId();
  return useQuery({
    queryKey: reminderQueryKeys.list(userId, status),
    enabled: Boolean(userId) && (options?.enabled ?? true),
    staleTime: REMINDER_LIST_STALE_MS,
    queryFn: () => fetchReminders(status),
    select: selectList,
  });
}
