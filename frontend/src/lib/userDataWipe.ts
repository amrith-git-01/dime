import type { QueryClient } from "@tanstack/react-query";

import { recentTransactionMutations } from "@/features/transactions/utils/recentMutationTracker";
import { etagCache } from "@/lib/api/etagCache";
import { clearPersistedNotifications } from "@/lib/notifications/notificationsMmkv";
import { deleteAllOutboxFiles } from "@/lib/outbox/outboxFiles";
import { clearOutboxStorage } from "@/lib/outbox/outboxStorage";
import { clearQueryMmkv } from "@/lib/queryPersister";
import { bumpUserDataEpoch } from "@/lib/userDataEpoch";
import { clearPersistedUserSettings } from "@/lib/settings/userSettingsMmkv";
import { clearWidgetCaptureData } from "@/lib/widgets/widgetCaptureMmkv";
import { clearWidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";
import { refreshWidgets } from "@/widgets/refreshWidgets";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";
import { useAgentChatUiStore } from "@/stores/agentChatUiStore";
import { useCurrentUserStore } from "@/stores/currentUserStore";
import { useOutboxStore } from "@/stores/outboxStore";
import { usePendingDeepLinkStore } from "@/stores/pendingDeepLinkStore";
import { useReceiptScanUiStore } from "@/stores/receiptScanUiStore";
import { useToastUiStore } from "@/stores/toastUiStore";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

/**
 * Clears API-derived MMKV (React Query cache blob, notifications, settings, profile) and the
 * outbox of not-yet-sent writes with its saved capture files. Does not touch auth or other device
 * settings.
 */
export function clearAppDataMmkv(): void {
  clearQueryMmkv();
  clearOutboxStorage();
  void deleteAllOutboxFiles();
  clearPersistedNotifications();
  clearPersistedUserSettings();
  useCurrentUserStore.getState().clearProfile();
  // The home-screen widget falls back to "Sign in to Dime" instead of showing the old user's money,
  // and the old user's capture status never reaches the next account.
  clearWidgetCaptureData();
  if (clearWidgetSnapshot()) {
    refreshWidgets();
  }
}

/** Puts every user-scoped UI store back to its initial state so nothing leaks to the next user. */
function resetUserScopedUiStores(): void {
  useAgentChatUiStore.setState(useAgentChatUiStore.getInitialState(), true);
  useOutboxStore.getState().reset();
  usePendingDeepLinkStore.setState(
    usePendingDeepLinkStore.getInitialState(),
    true,
  );
  useAddTransactionFabStore.setState(
    useAddTransactionFabStore.getInitialState(),
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
 * persisted snapshots, the remembered ETags, the outbox, user-scoped UI stores and the realtime echo tracker. Synchronous on
 * purpose: on a user switch it must finish before the new user's queries start, or it would wipe
 * them too.
 */
export function wipeUserData(queryClient: QueryClient): void {
  // First: anything in flight for the old user (an outbox upload, a GET) must neither write nor continue.
  bumpUserDataEpoch();
  void queryClient.cancelQueries();
  queryClient.clear();
  clearAppDataMmkv();
  resetUserScopedUiStores();
  recentTransactionMutations.clear();
  etagCache.clear();
}
