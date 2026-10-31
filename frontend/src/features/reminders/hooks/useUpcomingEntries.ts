import { useMemo } from "react";

import { useRecurringQuery } from "@/features/recurring/hooks/useRecurringQuery";
import { useCurrentDay } from "@/hooks/useCurrentDay";

import { selectUpcomingEntries } from "../utils/upcomingMerge";
import { useRemindersQuery } from "./useRemindersQuery";

/**
 * Home's Upcoming card: recurring income and bills due in the coming 30 days together with open
 * reminders (overdue ones included), soonest first. A reminders list that is still loading (or
 * failed) simply contributes nothing, so the card never waits on it.
 */
export function useUpcomingEntries() {
  const today = useCurrentDay();
  const income = useRecurringQuery("income");
  const subscriptions = useRecurringQuery("subscription");
  const reminders = useRemindersQuery("open");
  const incomeItems = income.data?.items;
  const subscriptionItems = subscriptions.data?.items;
  const reminderItems = reminders.data;

  const entries = useMemo(
    () =>
      selectUpcomingEntries({
        recurring: [...(incomeItems ?? []), ...(subscriptionItems ?? [])],
        reminders: reminderItems ?? [],
        today,
      }),
    [incomeItems, subscriptionItems, reminderItems, today],
  );

  return { entries, today };
}
