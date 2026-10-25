import { getAppliedCardOrder } from "@/features/cardLayout/appliedOrder";
import {
  DEFAULT_CARD_ORDER,
  type CardScreen,
} from "@/features/cardLayout/cardIds";
import { normalizeCardOrder } from "@/features/cardLayout/normalizeCardOrder";
import { readPersistedUserSettings } from "@/lib/settings/userSettingsMmkv";

import type { TourId } from "../constants/tourTypes";

const TOUR_SCREEN: Partial<Record<TourId, CardScreen>> = {
  home: "home",
  budgets: "budgets",
  insights: "insights",
};

/**
 * The card order a tab tour should follow right now: what the screen shows when it is mounted,
 * else the saved order on this device (the screen of a tab not opened yet shows exactly that).
 */
export function currentCardOrderForTour(
  tourId: TourId,
  userId: string | undefined,
): readonly string[] | undefined {
  const screen = TOUR_SCREEN[tourId];
  if (!screen) {
    return undefined;
  }
  return (
    getAppliedCardOrder(screen) ??
    normalizeCardOrder(
      readPersistedUserSettings(userId)?.cardLayouts[screen],
      DEFAULT_CARD_ORDER[screen],
    )
  );
}
