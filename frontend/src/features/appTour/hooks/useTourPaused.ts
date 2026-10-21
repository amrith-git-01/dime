import { useSyncExternalStore } from "react";

import { navigationRef } from "@/navigation/navigationRef";
import { useAgentChatUiStore } from "@/stores/agentChatUiStore";
import { useReceiptScanUiStore } from "@/stores/receiptScanUiStore";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

import { getTour, getTourOwnedScreens } from "../constants/tourRegistry";
import type { TourId, TourScreen } from "../constants/tourTypes";
import { getCurrentRouteName } from "../utils/tourNavigation";

/** How often to check whether the navigator is ready, for a subscriber that came before it. */
const READY_POLL_MS = 100;

const focusListeners = new Set<() => void>();

/**
 * Called by the tab navigator when a tab gains focus. The container's "state" event does not fire
 * when the tab navigator first mounts inside an already-ready stack, so the first tab (Home on a
 * cold start) is only reported through this.
 */
export function notifyTourTabFocused(): void {
  focusListeners.forEach((listener) => listener());
}

function subscribeToRoute(onChange: () => void): () => void {
  const unsubscribeState = navigationRef.addListener("state", onChange);
  focusListeners.add(onChange);
  const unsubscribe = () => {
    unsubscribeState();
    focusListeners.delete(onChange);
  };
  // "state" only fires on changes: a subscriber mounted before the navigator was ready never
  // hears about the initial route (the cold-start Home), so report once when it becomes ready.
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (!navigationRef.isReady()) {
    const check = () => {
      if (navigationRef.isReady()) {
        onChange();
      } else {
        timer = setTimeout(check, READY_POLL_MS);
      }
    };
    timer = setTimeout(check, READY_POLL_MS);
  }
  return () => {
    unsubscribe();
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  };
}

/** Name of the focused screen, kept current (the tour reads it through the navigation state, not on render). */
export function useCurrentRouteName(): string | undefined {
  return useSyncExternalStore(subscribeToRoute, getCurrentRouteName);
}

/** Whether voice capture or the receipt scan is open: no tour ever runs over those. */
export function useCaptureFlowOpen(): boolean {
  const voiceVisible = useVoiceCaptureUiStore((s) => s.visible);
  const receiptVisible = useReceiptScanUiStore((s) => s.visible);
  return voiceVisible || receiptVisible;
}

/** Whether a modal flow is open (agent chat, voice capture, receipt scan). */
export function useModalFlowOpen(): boolean {
  const agentVisible = useAgentChatUiStore((s) => s.visible);
  return useCaptureFlowOpen() || agentVisible;
}

/**
 * Pure rule behind `useTourPaused`: a tour shows only on a screen it owns, and a modal flow pauses
 * it, except the Ask AI chat for the tour that opened it (voice and receipt capture always pause).
 */
export function isTourPaused(input: {
  tourId: TourId;
  routeName: string | undefined;
  /** The Ask AI chat is open. */
  agentOpen: boolean;
  /** Voice capture or the receipt scan is open. */
  captureOpen: boolean;
}): boolean {
  const onOwnedScreen =
    input.routeName !== undefined &&
    getTourOwnedScreens(input.tourId).has(input.routeName as TourScreen);
  if (!onOwnedScreen) {
    return true;
  }
  if (input.captureOpen) {
    return true;
  }
  return input.agentOpen && getTour(input.tourId).allowsAgentChat !== true;
}

/**
 * The tour hides (keeping its place) while the user is somewhere it does not own: Settings, a
 * form, a notification target, or a modal flow (voice, scan) the tour did not open. It shows again
 * when they come back.
 */
export function useTourPaused(tourId: TourId): boolean {
  const agentOpen = useAgentChatUiStore((s) => s.visible);
  const captureOpen = useCaptureFlowOpen();
  const routeName = useCurrentRouteName();
  return isTourPaused({ tourId, routeName, agentOpen, captureOpen });
}
