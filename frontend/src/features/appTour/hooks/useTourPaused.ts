import { useEffect, useState } from "react";

import { navigationRef } from "@/navigation/navigationRef";
import { useAgentChatUiStore } from "@/stores/agentChatUiStore";
import { useReceiptScanUiStore } from "@/stores/receiptScanUiStore";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

import { getFocusedTourTab } from "../utils/tourNavigation";

/** True while one of the main tabs is the focused screen. */
function useOnMainTab(): boolean {
  const [onTab, setOnTab] = useState(() => getFocusedTourTab() !== null);

  useEffect(() => {
    const sync = () => setOnTab(getFocusedTourTab() !== null);
    sync();
    return navigationRef.addListener("state", sync);
  }, []);

  return onTab;
}

/** Whether a modal flow is open (agent chat, voice capture, receipt scan). */
export function useModalFlowOpen(): boolean {
  const agentVisible = useAgentChatUiStore((s) => s.visible);
  const voiceVisible = useVoiceCaptureUiStore((s) => s.visible);
  const receiptVisible = useReceiptScanUiStore((s) => s.visible);
  return agentVisible || voiceVisible || receiptVisible;
}

/**
 * The tour hides (keeping its place) while the user is somewhere else: a modal flow is open, or
 * a pushed screen (settings, a form, a notification target) covers the tabs.
 */
export function useTourPaused(): boolean {
  const modalFlowOpen = useModalFlowOpen();
  const onMainTab = useOnMainTab();
  return modalFlowOpen || !onMainTab;
}
