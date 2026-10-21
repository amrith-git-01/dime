import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { HomeOverview } from "@/features/transactions/types";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import type { SampleDomain } from "../types";

type TourPreviewState = {
  /** True while a tour that may show sample data is running. */
  active: boolean;
  /** Whose tour started it; nobody else ever sees sample data. */
  userId: string | undefined;
  /** The kinds of sample data this tour may show (and only on screens that are empty). */
  domains: readonly SampleDomain[];
  /** The tour is hidden (the user is on another screen): the real data shows meanwhile. */
  suspended: boolean;
  /**
   * Whether the account has no transactions at all, decided once per tour (from the first time the
   * Home overview is known) so every screen of the tour agrees: sample data only ever stands in
   * for an empty account, never beside real spending. Null until it is known.
   */
  accountEmpty: boolean | null;
  /**
   * How many previewed queries are mounted and showing sample data right now (the "Sample data"
   * pill follows it). It counts mounts, so starting or ending a tour never resets it.
   */
  shown: number;
};

const NO_DOMAINS: readonly SampleDomain[] = [];

/** Everything a tour start or end resets (not `shown`, which belongs to the mounted queries). */
const TOUR_STATE = {
  active: false,
  userId: undefined,
  domains: NO_DOMAINS,
  suspended: false,
  accountEmpty: null,
} as const;

const INITIAL_STATE: TourPreviewState = { ...TOUR_STATE, shown: 0 };

export const useTourPreviewStore = create<TourPreviewState>(() => INITIAL_STATE);

/**
 * Whether the signed-in user has any transactions, read from the Home overview the app already
 * loaded. "unknown" (not cached) is treated as activity by the caller.
 */
export function readHomeActivity(
  queryClient: QueryClient,
  userId: string,
): "empty" | "activity" | "unknown" {
  const home = queryClient.getQueryData<HomeOverview>(
    transactionsQueryKeys.home(userId, getDeviceIanaTimezone()),
  );
  if (!home) {
    return "unknown";
  }
  const hasActivity =
    home.recent_transactions.length > 0 || Number(home.spent_this_month) > 0;
  return hasActivity ? "activity" : "empty";
}

/**
 * Lets the screens of a running tour show sample data for the given kinds, and only for this user.
 * Whether any is shown at all is decided once, for the account: only an account with no
 * transactions sees sample data (see `latchAccountEmpty`); each previewed hook then also checks
 * that its own real data is empty.
 */
export function startTourPreview(
  userId: string | undefined,
  domains: readonly SampleDomain[],
): void {
  if (userId === undefined || domains.length === 0) {
    endTourPreview();
    return;
  }
  useTourPreviewStore.setState({ ...TOUR_STATE, active: true, userId, domains });
}

/** Ends the preview (tour finished, skipped, or the account changed). */
export function endTourPreview(): void {
  if (useTourPreviewStore.getState().active) {
    useTourPreviewStore.setState(TOUR_STATE);
  }
}

/** Records, the first time it is known during a tour, whether the account has no transactions. Later calls change nothing. */
export function latchAccountEmpty(empty: boolean): void {
  if (useTourPreviewStore.getState().accountEmpty === null) {
    useTourPreviewStore.setState({ accountEmpty: empty });
  }
}

/** Shows the real data while the tour is hidden (the user is on another screen), sample data again on return. */
export function setTourPreviewSuspended(suspended: boolean): void {
  const state = useTourPreviewStore.getState();
  if (state.active && state.suspended !== suspended) {
    useTourPreviewStore.setState({ suspended });
  }
}

/** A previewed query started (+1) or stopped (-1) showing sample data. */
export function reportSampleShown(delta: 1 | -1): void {
  useTourPreviewStore.setState((state) => ({
    shown: Math.max(0, state.shown + delta),
  }));
}

/** Pure check behind `usePreviewable`: may sample data of this kind show for this user right now? */
export function isTourPreviewShowing(
  state: TourPreviewState,
  sessionUserId: string | undefined,
  domain: SampleDomain,
): boolean {
  return (
    state.active &&
    !state.suspended &&
    sessionUserId !== undefined &&
    state.userId === sessionUserId &&
    state.domains.includes(domain)
  );
}

/** True while sample data is actually on screen for this user (what the tour's "Sample data" pill shows). */
export function isSampleDataOnScreen(
  state: TourPreviewState,
  sessionUserId: string | undefined,
): boolean {
  return (
    state.active &&
    !state.suspended &&
    sessionUserId !== undefined &&
    state.userId === sessionUserId &&
    state.shown > 0
  );
}
