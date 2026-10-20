import { useEffect } from "react";

import { useTransactionsHomeQuery } from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";

import { isAppTourSeen, useAppTourStore } from "../store/appTourStore";
import { getFocusedTourTab } from "../utils/tourNavigation";

import { useModalFlowOpen } from "./useTourPaused";

/** Let the first screen settle (and the splash fade) before the tour appears. */
const AUTO_START_DELAY_MS = 600;

/**
 * Starts the app tour once for a signed-in user, when the app is calm: the main shell is laid
 * out, the splash is gone and no modal flow is open.
 * Call from the main tab navigator.
 */
export function useAppTourAutoStart({
  shellReady,
  splashRevealed,
}: {
  /** Header and tab bar are laid out. */
  shellReady: boolean;
  /** The branded splash overlay is gone. */
  splashRevealed: boolean;
}): void {
  const { userId } = useSessionUserId();
  const modalFlowOpen = useModalFlowOpen();
  const fabOpen = useAddTransactionFabStore((s) => s.fabOpen);
  const tourActive = useAppTourStore((s) => s.active);
  const startTour = useAppTourStore((s) => s.start);
  // Wait for the real Home overview, so the tour opens on the screen the user will actually see.
  const homeLoaded = useTransactionsHomeQuery().isSuccess;

  const calm =
    shellReady &&
    splashRevealed &&
    homeLoaded &&
    !modalFlowOpen &&
    !fabOpen &&
    !tourActive;

  useEffect(() => {
    if (!calm || userId === undefined) {
      return;
    }
    const timer = setTimeout(() => {
      if (isAppTourSeen(userId) || getFocusedTourTab() === null) {
        return;
      }
      startTour();
    }, AUTO_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [calm, userId, startTour]);
}
