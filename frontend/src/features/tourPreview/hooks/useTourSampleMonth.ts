import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { categoriesQueryKeys } from "@/features/categories/queryKeys";
import type { CategoryRow } from "@/features/categories/types";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import { isTourPreviewShowing, useTourPreviewStore } from "../store/tourPreviewStore";
import { buildSampleMonth, type TourSampleMonth } from "../utils/buildSampleMonth";

const CATEGORY_SCOPES = ["spend", "recurring_expense", "recurring_income"] as const;

/**
 * The sample month while the guided tour is previewing it for the signed-in user, else `null`.
 * Reads the categories cache (never writes) so rows use the account's real category ids and icons.
 * Stable between renders, so screens that memoise on the data do not recompute.
 */
export function useTourSampleMonth(): TourSampleMonth | null {
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();
  const showing = useTourPreviewStore((state) => isTourPreviewShowing(state, userId));
  const today = useCurrentDay();

  return useMemo(() => {
    if (!showing || userId === undefined) {
      return null;
    }
    const categories = CATEGORY_SCOPES.flatMap(
      (scope) =>
        queryClient.getQueryData<CategoryRow[]>(categoriesQueryKeys.list(userId, scope)) ?? [],
    );
    return buildSampleMonth({
      today,
      now: new Date(),
      timezone: getDeviceIanaTimezone(),
      userId,
      categories,
    });
  }, [showing, userId, today, queryClient]);
}
