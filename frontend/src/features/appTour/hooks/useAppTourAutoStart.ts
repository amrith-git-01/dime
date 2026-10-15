import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";
import { usePermissionsPromptStore } from "@/stores/permissionsPromptStore";

import { isAppTourSeen, useAppTourStore } from "../store/appTourStore";
import { getFocusedTourTab } from "../utils/tourNavigation";

import { useModalFlowOpen } from "./useTourPaused";

/** Let the first screen settle (and the splash fade) before the tour appears. */
const AUTO_START_DELAY_MS = 600;

/**
 * Starts the app tour once for a signed-in user, when the app is calm: the main shell is laid
 * out, the splash is gone, the native permission dialogs are done and no modal flow is open.
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
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();
  const permissionsBusy = usePermissionsPromptStore(
    (s) => s.pendingAfterGoogleSignIn || s.prompting,
  );
  const modalFlowOpen = useModalFlowOpen();
  const fabOpen = useAddTransactionFabStore((s) => s.fabOpen);
  const tourActive = useAppTourStore((s) => s.active);
  const startTour = useAppTourStore((s) => s.start);

  const calm =
    shellReady &&
    splashRevealed &&
    !permissionsBusy &&
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
      startTour(queryClient);
    }, AUTO_START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [calm, userId, startTour, queryClient]);
}
