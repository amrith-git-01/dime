import type { ReminderListStatus } from "./types";

/**
 * Bump when the shape `remindersApi` returns changes incompatibly. It is part of the keys, so
 * entries persisted under the old shape are never read again (they age out with the cache).
 */
export const REMINDER_CACHE_SHAPE = 1;

export const reminderQueryKeys = {
  all: ["reminders"] as const,
  list: (userId: string | undefined, status: ReminderListStatus) =>
    [
      ...reminderQueryKeys.all,
      `list.v${REMINDER_CACHE_SHAPE}`,
      userId ?? "none",
      status,
    ] as const,
};
