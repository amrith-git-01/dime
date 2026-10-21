import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { useSessionUserId } from "@/hooks/useSessionUserId";

import {
  latchAccountEmpty,
  readHomeActivity,
  reportSampleShown,
  useTourPreviewStore,
} from "../store/tourPreviewStore";
import type { SampleDomain } from "../types";
import type { TourSampleSet } from "../utils/buildSampleMonth";
import { applySamplePreview } from "../utils/previewable";

import { useTourSampleSet } from "./useTourSampleSet";

export type PreviewOptions<R extends { data: unknown }> = {
  /** The kind of sample data this query stands in for. */
  domain: SampleDomain;
  /** The real data is empty, so the screen would show its empty state (only then does the sample show). */
  isEmpty: (data: NonNullable<R["data"]>) => boolean;
  /**
   * What the sample provides for this query; undefined for anything it does not cover (another
   * month). `past` marks last month's sample, which only shows when the whole account is empty.
   */
  select: (set: TourSampleSet) => { data: R["data"]; past?: boolean } | undefined;
  /**
   * An extra condition read from the query cache, for samples that must agree with other data
   * (recurring income only samples when the subscriptions are empty too).
   */
  cacheCheck?: (queryClient: QueryClient, userId: string | undefined) => boolean;
};

const noopSubscribe = () => () => undefined;

/**
 * While a guided tour previews sample data, returns `real` with the sample standing in as its
 * data, but only for an account with no transactions at all (decided once per tour, so the screens
 * agree) and only when this query's own real data is empty. Budgets and recurring items are only
 * sampled when transactions are sampled too. Anything else returns `real` unchanged. Call it AFTER the real `useQuery` (which stays as it was).
 *
 * The sample lives only in this return value: it is never put in the QueryClient, so it cannot be
 * persisted, refetched over, or shown to another account.
 */
export function usePreviewable<R extends { data: unknown }>(
  real: R,
  options: PreviewOptions<R>,
): R {
  const set = useTourSampleSet(options.domain);
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();
  const enabled = set !== null;

  // Read through the query cache's own subscription: a plain read would be memoised by the React
  // Compiler and never notice the cache filling in.
  const subscribe = useMemo(
    () =>
      enabled
        ? (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange)
        : noopSubscribe,
    [enabled, queryClient],
  );
  const accountActivity = useSyncExternalStore(subscribe, () =>
    enabled && userId !== undefined ? readHomeActivity(queryClient, userId) : "unknown",
  );
  const latched = useTourPreviewStore((state) => state.accountEmpty);
  const transactionsSampled = useTourPreviewStore((state) =>
    state.domains.includes("transactions"),
  );
  const known = accountActivity === "unknown" ? null : accountActivity === "empty";
  const accountEmpty = latched ?? known;
  useEffect(() => {
    if (enabled && latched === null && known !== null) {
      latchAccountEmpty(known);
    }
  }, [enabled, latched, known]);
  const extraOk = useSyncExternalStore(subscribe, () =>
    enabled && options.cacheCheck ? options.cacheCheck(queryClient, userId) : true,
  );

  let sample: R["data"] | undefined;
  const coherent =
    accountEmpty === true && (options.domain === "transactions" || transactionsSampled);
  if (
    set &&
    coherent &&
    extraOk &&
    // The account is known to be empty, so a transactions query that has not answered yet (or
    // cannot, offline) would answer "empty": the sample shows at once, with no spinner first.
    // Other kinds wait for their real answer, which may well hold data.
    (real.data === undefined
      ? options.domain === "transactions"
      : options.isEmpty(real.data as NonNullable<R["data"]>))
  ) {
    sample = options.select(set)?.data;
  }

  const applied = sample !== undefined;
  useEffect(() => {
    if (!applied) {
      return;
    }
    reportSampleShown(1);
    return () => reportSampleShown(-1);
  }, [applied]);

  return applySamplePreview(real, sample);
}
