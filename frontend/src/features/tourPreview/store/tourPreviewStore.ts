import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { HomeOverview } from "@/features/transactions/types";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

type TourPreviewState = {
  /** True while the tour shows sample data in place of an empty account. */
  active: boolean;
  /** Whose tour latched the preview; nobody else ever sees sample data. */
  userId: string | undefined;
  /** The tour is hidden (the user is on another screen): the real data shows meanwhile. */
  suspended: boolean;
};

const INITIAL_STATE: TourPreviewState = {
  active: false,
  userId: undefined,
  suspended: false,
};

export const useTourPreviewStore = create<TourPreviewState>(() => INITIAL_STATE);

/**
 * Whether the signed-in user has any transactions, read from the Home overview the app already
 * loaded (the tour starts on Home). "unknown" (not cached) is treated as activity by the caller.
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
 * Latches the sample-data preview for this tour, but only when the Home overview is loaded and
 * the account is empty. Anything uncertain (not loaded, signed out) leaves the real data alone.
 * Returns whether the preview is now on.
 */
export function startTourPreviewIfEmpty(
  queryClient: QueryClient,
  userId: string | undefined,
): boolean {
  if (userId === undefined || readHomeActivity(queryClient, userId) !== "empty") {
    endTourPreview();
    return false;
  }
  useTourPreviewStore.setState({ active: true, userId, suspended: false });
  return true;
}

/** Ends the preview (tour finished, skipped, or the account changed). */
export function endTourPreview(): void {
  if (useTourPreviewStore.getState().active) {
    useTourPreviewStore.setState(INITIAL_STATE);
  }
}

/** Shows the real data while the tour is hidden (the user is on another screen), sample data again on return. */
export function setTourPreviewSuspended(suspended: boolean): void {
  const state = useTourPreviewStore.getState();
  if (state.active && state.suspended !== suspended) {
    useTourPreviewStore.setState({ suspended });
  }
}

/** Pure check behind {@link usePreviewable}: is sample data on for this signed-in user right now? */
export function isTourPreviewShowing(
  state: TourPreviewState,
  sessionUserId: string | undefined,
): boolean {
  return (
    state.active &&
    !state.suspended &&
    sessionUserId !== undefined &&
    state.userId === sessionUserId
  );
}
