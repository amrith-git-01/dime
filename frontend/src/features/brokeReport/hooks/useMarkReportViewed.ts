import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";

import { markReportViewed } from "../api/reportsApi";
import { reportQueryKeys } from "../queryKeys";
import type { ReportListItem } from "../types";

/**
 * Marks a report as seen. The list cache flips first (the Home banner and the unviewed dots go
 * away at once); a failure puts the list back. Call it once, when the report is opened.
 */
export function useMarkReportViewed() {
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();

  return useMutation({
    mutationKey: [...reportQueryKeys.all, "viewed"],
    mutationFn: (periodKey: string) => markReportViewed(periodKey),
    onMutate: async (periodKey: string) => {
      const key = reportQueryKeys.list(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ReportListItem[]>(key);
      if (previous) {
        queryClient.setQueryData<ReportListItem[]>(
          key,
          previous.map((item) =>
            item.period_key === periodKey ? { ...item, viewed: true } : item,
          ),
        );
      }
      return { previous };
    },
    onError: (_error, _periodKey, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          reportQueryKeys.list(userId),
          context.previous,
        );
      }
    },
  });
}
