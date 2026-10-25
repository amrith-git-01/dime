import { useIsFocused } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { settingsQueryKeys } from "@/features/settings/queryKeys";
import { useUpdateUserSettingsMutation } from "@/features/settings/hooks/useUpdateUserSettingsMutation";
import { useUserSettingsQuery } from "@/features/settings/hooks/useUserSettingsQuery";
import type { UserSettings } from "@/features/settings/types";
import { isTransientSaveError } from "@/features/settings/utils/saveError";
import { useSessionUserId } from "@/hooks/useSessionUserId";

import { setAppliedCardOrder } from "../appliedOrder";
import {
  DEFAULT_CARD_ORDER,
  type CardIdOf,
  type CardScreen,
} from "../cardIds";
import {
  normalizeCardOrder,
  orderToSave,
  sameOrder,
} from "../normalizeCardOrder";

/** A device with nothing cached waits this long for the saved order before showing the default one. */
export const CARD_ORDER_WAIT_MS = 1000;

export type CardOrderState<S extends CardScreen> = {
  /** The order to render. */
  order: readonly CardIdOf<S>[];
  /** False while a device with no cached settings still waits (up to ~1 s) for the saved order. */
  ready: boolean;
  /** Done in the Arrange sheet: shows the new order at once and saves it in the background. */
  commit: (next: readonly CardIdOf<S>[]) => void;
};

/**
 * The order of a screen's cards, without ever re-arranging cards in front of the user.
 *
 * - The saved order comes from the settings query, which is restored from the device before the
 *   first paint, so a launch shows the saved order straight away.
 * - What is shown is held in local state. An order that arrives from the server (another device)
 *   is applied only while the screen is not in front of the user, so it is already in place the
 *   next time they look.
 * - A device with nothing cached waits up to a second for the settings (the screen shows its
 *   loading state); after that the default order is shown and kept for the visit. It does not wait
 *   at all when the settings cannot be fetched (offline, or the request failed).
 * - Done in the sheet applies at once (`commit`) and saves in the background. A save the server
 *   rejects puts the previous order back at once; one that failed for a passing reason (offline,
 *   5xx) keeps the new order and is sent again later (see `cardLayoutSync`).
 */
export function useCardOrder<S extends CardScreen>(
  screen: S,
): CardOrderState<S> {
  const defaults = DEFAULT_CARD_ORDER[screen] as readonly CardIdOf<S>[];
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();
  const settings = useUserSettingsQuery();
  const { mutate: saveSettings } = useUpdateUserSettingsMutation();
  const isFocused = useIsFocused();

  const loaded = settings.data !== undefined;
  const saved = settings.data?.cardLayouts[screen];
  const target = useMemo(
    () => normalizeCardOrder<CardIdOf<S>>(saved, defaults),
    [saved, defaults],
  );

  const [applied, setApplied] = useState<readonly CardIdOf<S>[] | null>(
    loaded ? target : null,
  );
  if (applied === null && loaded) {
    setApplied(target);
  }

  // Waiting on a new device: give up after a moment and keep the default order for this visit.
  // No point waiting when the fetch already failed or is paused offline (a cold start without a
  // connection would otherwise show the loading state on every launch).
  const cannotFetch = settings.isError || settings.fetchStatus === "paused";
  useEffect(() => {
    if (applied !== null) {
      return;
    }
    if (cannotFetch) {
      setApplied(defaults);
      return;
    }
    const timer = setTimeout(
      () => setApplied((current) => current ?? defaults),
      CARD_ORDER_WAIT_MS,
    );
    return () => clearTimeout(timer);
  }, [applied, cannotFetch, defaults]);

  // A different order from the server lands only while the screen is out of sight.
  useEffect(() => {
    if (applied !== null && !isFocused && !sameOrder(applied, target)) {
      setApplied(target);
    }
  }, [applied, isFocused, target]);

  // Coming back to the screen is when another device's change is fetched (if the copy is stale).
  // A refetch skipped here because a save is running is picked up the next time the screen is focused.
  useEffect(() => {
    if (!isFocused || queryClient.isMutating() > 0) {
      return;
    }
    void queryClient.refetchQueries({
      queryKey: settingsQueryKeys.user(userId),
      stale: true,
    });
  }, [isFocused, queryClient, userId]);

  useEffect(() => {
    if (applied !== null) {
      setAppliedCardOrder(screen, applied);
    }
  }, [screen, applied]);

  const commit = useCallback(
    (next: readonly CardIdOf<S>[]) => {
      setApplied(next);
      saveSettings(
        { cardLayouts: { [screen]: orderToSave(next, defaults) } },
        {
          onError: (error) => {
            if (isTransientSaveError(error)) {
              return;
            }
            // Rejected for good: the mutation has put the saved order back in the cache; show it now,
            // not on the next blur.
            const saved = queryClient.getQueryData<UserSettings>(
              settingsQueryKeys.user(userId),
            )?.cardLayouts[screen];
            setApplied(normalizeCardOrder<CardIdOf<S>>(saved, defaults));
          },
        },
      );
    },
    [defaults, queryClient, saveSettings, screen, userId],
  );

  return { order: applied ?? defaults, ready: applied !== null, commit };
}
