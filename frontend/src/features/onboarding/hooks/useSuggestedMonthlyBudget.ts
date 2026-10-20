import { useMemo } from "react";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { getStoredGoal } from "@/lib/onboarding/goalStorage";

/**
 * The monthly budget (₹) the user typed in the goal step of profile setup, if any. The budget screens
 * offer it while no budget is set (the caller decides that), so a failed save during setup is not lost.
 */
export function useSuggestedMonthlyBudget(): number | undefined {
  const { userId } = useSessionUserId();
  return useMemo(
    () => (userId ? getStoredGoal(userId)?.budgetAmount : undefined),
    [userId],
  );
}
