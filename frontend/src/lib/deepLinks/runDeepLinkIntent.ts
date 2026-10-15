import { StackActions } from "@react-navigation/native";

import { navigationRef } from "@/navigation/navigationRef";
import { useAgentChatUiStore } from "@/stores/agentChatUiStore";
import { usePendingDeepLinkStore } from "@/stores/pendingDeepLinkStore";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

import type { DeepLinkIntent } from "./parseDeepLink";

/** Performs a parsed link. Call only when `canNavigateToMain()` is true. */
export function runDeepLinkIntent(intent: DeepLinkIntent): void {
  switch (intent.kind) {
    case "home":
      navigationRef.navigate("Main", {
        screen: "MainTabs",
        params: { screen: "Home" },
      });
      return;
    case "add":
      // `push` (not `navigate`) so a fresh form is created even when one is already open.
      navigationRef.dispatch(
        StackActions.push("ManualAddTransaction", {
          focusAmount: true,
          ...(intent.date ? { presetDate: intent.date } : {}),
        }),
      );
      return;
    case "scan":
      // The camera flow lives with the main tabs, which also know the daily scan limit.
      usePendingDeepLinkStore.getState().requestScan();
      return;
    case "voice":
      useVoiceCaptureUiStore.getState().open();
      return;
    case "budgets":
      navigationRef.navigate("Main", {
        screen: "MainTabs",
        params: {
          screen: "Budgets",
          params: intent.recurring ? { recurringKind: "subscription" } : undefined,
        },
      });
      return;
    case "agent":
      // The chat overlay lives inside the main tabs; screens pushed above them would hide it.
      navigationRef.navigate("Main", {
        screen: "MainTabs",
        params: { screen: "Home" },
      });
      useAgentChatUiStore.getState().open();
      return;
  }
}
