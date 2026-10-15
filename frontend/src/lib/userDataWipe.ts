import type { QueryClient } from "@tanstack/react-query";

import { recentTransactionMutations } from "@/features/transactions/utils/recentMutationTracker";
import { clearPersistedNotifications } from "@/lib/notifications/notificationsMmkv";
import { clearQueryMmkv } from "@/lib/queryPersister";
import { clearPersistedUserSettings } from "@/lib/settings/userSettingsMmkv";
import { clearWidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";
import { refreshWidgets } from "@/widgets/refreshWidgets";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";
import { useAgentChatUiStore } from "@/stores/agentChatUiStore";
import { useCurrentUserStore } from "@/stores/currentUserStore";
import { usePendingDeepLinkStore } from "@/stores/pendingDeepLinkStore";
import { usePermissionsPromptStore } from "@/stores/permissionsPromptStore";
import { useReceiptScanUiStore } from "@/stores/receiptScanUiStore";
import { useToastUiStore } from "@/stores/toastUiStore";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

/**
 * Clears API-derived MMKV (React Query cache blob, notifications, settings, profile).
 * Does not touch auth or other device settings.
 */
export function clearAppDataMmkv(): void {
  clearQueryMmkv();
  clearPersistedNotifications();
  clearPersistedUserSettings();
  useCurrentUserStore.getState().clearProfile();
  // Home-screen widgets fall back to "Sign in to Dime" instead of showing the old user's money.
  if (clearWidgetSnapshot()) {
    refreshWidgets();
  }
}

/** Puts every user-scoped UI store back to its initial state so nothing leaks to the next user. */
function resetUserScopedUiStores(): void {
  useAgentChatUiStore.setState(useAgentChatUiStore.getInitialState(), true);
  usePendingDeepLinkStore.setState(
    usePendingDeepLinkStore.getInitialState(),
    true,
  );
  useAddTransactionFabStore.setState(
    useAddTransactionFabStore.getInitialState(),
    true,
  );
  usePermissionsPromptStore.setState(
    usePermissionsPromptStore.getInitialState(),
    true,
  );
  useReceiptScanUiStore.setState(useReceiptScanUiStore.getInitialState(), true);
  useToastUiStore.setState(useToastUiStore.getInitialState(), true);
  useVoiceCaptureUiStore.setState(
    useVoiceCaptureUiStore.getInitialState(),
    true,
  );
}

/**
 * Drops everything the previous user's data lives in: in-flight and cached queries, the
 * persisted snapshots, user-scoped UI stores and the realtime echo tracker. Synchronous on
 * purpose: on a user switch it must finish before the new user's queries start, or it would wipe
 * them too.
 */
export function wipeUserData(queryClient: QueryClient): void {
  void queryClient.cancelQueries();
  queryClient.clear();
  clearAppDataMmkv();
  resetUserScopedUiStores();
  recentTransactionMutations.clear();
}
