import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { categoriesQueryKeys } from "@/features/categories/queryKeys";
import type { CategoryRow } from "@/features/categories/types";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import {
  isTourPreviewShowing,
  useTourPreviewStore,
} from "../store/tourPreviewStore";
import type { SampleDomain } from "../types";
import { buildSampleSet, type TourSampleSet } from "../utils/buildSampleMonth";

const CATEGORY_SCOPES = ["spend", "recurring_expense", "recurring_income"] as const;

/** One built set shared by every previewed hook on screen (they all ask for it on each render). */
let cached: { key: string; set: TourSampleSet } | null = null;

/**
 * The sample months while a tour is previewing this kind of data for the signed-in user, else
 * `null`. Reads the categories cache (never writes) so rows use the account's real category ids
 * and icons. Stable between renders, so screens that memoise on the data do not recompute.
 */
export function useTourSampleSet(domain: SampleDomain): TourSampleSet | null {
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();
  const showing = useTourPreviewStore((state) =>
    isTourPreviewShowing(state, userId, domain),
  );
  const today = useCurrentDay();

  return useMemo(() => {
    if (!showing || userId === undefined) {
      return null;
    }
    const categories = CATEGORY_SCOPES.flatMap(
      (scope) =>
        queryClient.getQueryData<CategoryRow[]>(
          categoriesQueryKeys.list(userId, scope),
        ) ?? [],
    );
    const timezone = getDeviceIanaTimezone();
    const key = [
      userId,
      today.getTime(),
      timezone,
      categories.map((category) => category.id).join(","),
    ].join("|");
    if (cached?.key !== key) {
      cached = {
        key,
        set: buildSampleSet({
          today,
          now: new Date(),
          timezone,
          userId,
          categories,
        }),
      };
    }
    return cached.set;
  }, [showing, userId, today, queryClient]);
}
