import { askNotificationsInContext } from "@/features/onboarding/utils/askNotificationsInContext";
import { usePreviewable } from "@/features/tourPreview";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import {
  fetchBudget,
  upsertBudget,
  type UpsertBudgetInput,
} from "@/features/budgets/api/budgetsApi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invalidateBudgetAlertQueries } from "../cache/invalidateBudgetQueries";
import { budgetQueryKeys } from "../queryKeys";

export function useBudgetQuery(options?: { enabled?: boolean }) {
  const { userId } = useSessionUserId();

  const query = useQuery({
    queryKey: budgetQueryKeys.current(userId),
    queryFn: fetchBudget,
    enabled: options?.enabled ?? true,
  });
  return usePreviewable(query, (sample) => sample.budget);
}

export function useUpsertBudgetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertBudgetInput) => upsertBudget(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: budgetQueryKeys.all });
      invalidateBudgetAlertQueries(qc);
      void askNotificationsInContext(
        "Get a heads-up when you're close to your monthly budget.",
        qc,
      );
    },
  });
}
