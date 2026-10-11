import { useMemo } from "react";

import { useCurrentDay } from "@/hooks/useCurrentDay";

import { selectUpcoming } from "../utils/recurringDisplay";
import { useRecurringQuery } from "./useRecurringQuery";

/** Next few recurring items due in the coming 30 days (income + subscriptions), soonest first. */
export function useUpcomingRecurring() {
  const today = useCurrentDay();
  const income = useRecurringQuery("income");
  const subscriptions = useRecurringQuery("subscription");
  const incomeItems = income.data?.items;
  const subscriptionItems = subscriptions.data?.items;

  const items = useMemo(
    () =>
      selectUpcoming(
        [...(incomeItems ?? []), ...(subscriptionItems ?? [])],
        today,
      ),
    [incomeItems, subscriptionItems, today],
  );

  return { items, today };
}
