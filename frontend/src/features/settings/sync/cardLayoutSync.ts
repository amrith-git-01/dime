import NetInfo from "@react-native-community/netinfo";
import type { QueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";

import { CARD_SCREENS, type CardLayouts } from "@/features/cardLayout/cardIds";
import { sameOrder } from "@/features/cardLayout/normalizeCardOrder";
import {
  readPendingCardLayoutScreens,
  readPersistedUserSettings,
  removePendingCardLayoutScreens,
  writePersistedUserSettings,
} from "@/lib/settings/userSettingsMmkv";
import { currentUserDataEpoch } from "@/lib/userDataEpoch";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { useConnectivityStore } from "@/stores/connectivityStore";
import { useToastUiStore } from "@/stores/toastUiStore";

import { patchUserSettings } from "../api/settingsApi";
import { CARD_ORDER_SAVE_FAILED_MESSAGE } from "../hooks/useUpdateUserSettingsMutation";
import { settingsQueryKeys } from "../queryKeys";
import type { UserSettings } from "../types";
import { isTransientSaveError } from "../utils/saveError";

let inFlight: Promise<void> | null = null;

async function run(queryClient: QueryClient): Promise<void> {
  const userId = useAuthSessionStore.getState().userId;
  if (!userId) {
    return;
  }
  const screens = readPendingCardLayoutScreens(userId);
  if (screens.length === 0) {
    return;
  }
  const queryKey = settingsQueryKeys.user(userId);
  // A save in progress will clear or re-mark these itself; the next trigger looks again.
  if (queryClient.isMutating({ mutationKey: settingsQueryKeys.update(userId) }) > 0) {
    return;
  }
  const local =
    queryClient.getQueryData<UserSettings>(queryKey) ?? readPersistedUserSettings(userId);
  if (!local) {
    return;
  }
  // What to send for each screen: its order here, or [] (back to the default) when it has none.
  const sent: CardLayouts = {};
  for (const screen of screens) {
    sent[screen] = local.cardLayouts[screen] ?? [];
  }
  const epoch = currentUserDataEpoch();
  try {
    const saved = await patchUserSettings({ cardLayouts: sent });
    if (epoch !== currentUserDataEpoch()) {
      return;
    }
    const now = queryClient.getQueryData<UserSettings>(queryKey) ?? local;
    // A screen arranged again while this was on its way stays pending: the newer order still has to be sent.
    const settled = CARD_SCREENS.filter(
      (screen) =>
        sent[screen] !== undefined &&
        sameOrder(now.cardLayouts[screen] ?? [], sent[screen] ?? []),
    );
    removePendingCardLayoutScreens(userId, settled);
    if (queryClient.isMutating({ mutationKey: settingsQueryKeys.update(userId) }) === 0) {
      const stillPending = readPendingCardLayoutScreens(userId);
      const layouts: CardLayouts = { ...saved.cardLayouts };
      for (const screen of stillPending) {
        const ids = now.cardLayouts[screen];
        if (ids === undefined) {
          delete layouts[screen];
        } else {
          layouts[screen] = ids;
        }
      }
      const next = { ...saved, cardLayouts: layouts };
      queryClient.setQueryData(queryKey, next);
      writePersistedUserSettings(userId, next);
    }
  } catch (error) {
    if (epoch !== currentUserDataEpoch() || isTransientSaveError(error)) {
      // Still cannot reach the server (or the user is gone): stays pending for the next trigger.
      return;
    }
    // Rejected for good: drop the orders that were waiting and show what the server has.
    removePendingCardLayoutScreens(userId, screens);
    useToastUiStore
      .getState()
      .show({ message: CARD_ORDER_SAVE_FAILED_MESSAGE, variant: "error" });
    void queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * Sends the arranged card orders whose save failed for a passing reason (see
 * `useUpdateUserSettingsMutation`). Single-flight: a second call while one runs shares it.
 */
export function syncPendingCardLayouts(queryClient: QueryClient): Promise<void> {
  inFlight ??= run(queryClient).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Runs `syncPendingCardLayouts` when a user is signed in at launch (or signs in), when the device
 * comes back online and when the app returns to the foreground. Returns an unsubscribe function.
 */
export function startCardLayoutSync(queryClient: QueryClient): () => void {
  const request = () => {
    void syncPendingCardLayouts(queryClient);
  };
  if (useAuthSessionStore.getState().userId) {
    request();
  }
  const unsubscribeAuth = useAuthSessionStore.subscribe((state, prev) => {
    if (state.userId && state.userId !== prev.userId) {
      request();
    }
  });
  const unsubscribeConnectivity = useConnectivityStore.subscribe((state, prev) => {
    if (state.isOnline && !prev.isOnline) {
      request();
    }
  });
  const appStateSub = AppState.addEventListener("change", (status) => {
    if (status === "active") {
      request();
    }
  });
  // NetInfo can report "connected" before the connectivity store hears it (cold start): one look now.
  void NetInfo.fetch()
    .then((state) => {
      if (state.isConnected !== false) {
        request();
      }
    })
    .catch(() => undefined);
  return () => {
    unsubscribeAuth();
    unsubscribeConnectivity();
    appStateSub.remove();
  };
}
