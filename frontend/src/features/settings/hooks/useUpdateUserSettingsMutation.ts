import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToastUiStore } from "@/stores/toastUiStore";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import {
  addPendingCardLayoutScreens,
  readPendingCardLayoutScreens,
  removePendingCardLayoutScreens,
  writePersistedUserSettings,
} from "@/lib/settings/userSettingsMmkv";
import { currentUserDataEpoch } from "@/lib/userDataEpoch";

import { patchUserSettings } from "../api/settingsApi";
import { settingsQueryKeys } from "../queryKeys";
import {
  applyUserSettingsPatch,
  type UserSettings,
  type UserSettingsPatch,
} from "../types";
import { isTransientSaveError } from "../utils/saveError";
import {
  overlayPendingLayouts,
  patchedLayoutScreens,
  rollbackPatchedKeys,
  snapshotPatchedKeys,
  type PatchedKeysSnapshot,
} from "../utils/settingsPatchRollback";

export const CARD_ORDER_SAVE_FAILED_MESSAGE = "Couldn't save the new order.";

type MutationContext = {
  /** What the patch overwrote, key by key; undefined when there was no cached copy to patch. */
  snapshot: PatchedKeysSnapshot | undefined;
  epoch: number;
};

/**
 * Saves settings, optimistically.
 *
 * - A failed save puts back only the keys it changed (and only while they still hold what it set),
 *   so another save that went through meanwhile survives.
 * - An arranged card order whose save failed for a reason that will pass (offline, timeout, 5xx,
 *   429) is kept, on screen and on the device, and marked pending: `cardLayoutSync` sends it again
 *   when the app can reach the server. A rejection (4xx) rolls that screen back at once, with a toast.
 * - A save that settles while another one is still running does not overwrite the cache with its
 *   answer (it may not include the other save yet): it only marks the settings stale.
 */
export function useUpdateUserSettingsMutation() {
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();
  const queryKey = settingsQueryKeys.user(userId);
  const mutationKey = settingsQueryKeys.update(userId);

  const store = (settings: UserSettings) => {
    queryClient.setQueryData(queryKey, settings);
    if (userId) {
      writePersistedUserSettings(userId, settings);
    }
  };

  return useMutation<UserSettings, unknown, UserSettingsPatch, MutationContext>({
    mutationKey,
    mutationFn: patchUserSettings,
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<UserSettings>(queryKey);
      if (previous) {
        store(applyUserSettingsPatch(previous, patch));
      }
      return {
        snapshot: previous ? snapshotPatchedKeys(previous, patch) : undefined,
        epoch: currentUserDataEpoch(),
      };
    },
    onError: (error, patch, context) => {
      // The user signed out or switched while the save was in flight: nothing here is theirs now.
      if (!context || context.epoch !== currentUserDataEpoch()) {
        return;
      }
      const screens = patchedLayoutScreens(patch);
      const transient = isTransientSaveError(error);
      const current = queryClient.getQueryData<UserSettings>(queryKey);
      if (current && context.snapshot) {
        store(
          rollbackPatchedKeys(current, patch, context.snapshot, {
            keepLayouts: transient,
          }),
        );
      }
      if (screens.length === 0) {
        return;
      }
      if (transient) {
        if (userId) {
          addPendingCardLayoutScreens(userId, screens);
        }
      } else {
        useToastUiStore
          .getState()
          .show({ message: CARD_ORDER_SAVE_FAILED_MESSAGE, variant: "error" });
      }
    },
    onSuccess: (data, patch, context) => {
      if (context && context.epoch !== currentUserDataEpoch()) {
        return;
      }
      const screens = patchedLayoutScreens(patch);
      if (userId && screens.length > 0) {
        // The server has this order now; it is no longer waiting to be sent.
        removePendingCardLayoutScreens(userId, screens);
      }
      if (queryClient.isMutating({ mutationKey }) > 1) {
        void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
        return;
      }
      store(
        overlayPendingLayouts(
          data,
          queryClient.getQueryData<UserSettings>(queryKey),
          readPendingCardLayoutScreens(userId),
        ),
      );
    },
  });
}
