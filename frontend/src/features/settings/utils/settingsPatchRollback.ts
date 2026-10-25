import {
  CARD_SCREENS,
  type CardLayouts,
  type CardScreen,
} from "@/features/cardLayout/cardIds";
import { sameOrder } from "@/features/cardLayout/normalizeCardOrder";

import type { UserSettings, UserSettingsPatch } from "../types";

/** What a patch is about to overwrite: just the keys it names (a scalar, or one screen's layout). */
export type PatchedKeysSnapshot = {
  scalars: Partial<Omit<UserSettings, "cardLayouts">>;
  layouts: Partial<Record<CardScreen, string[] | undefined>>;
};

/** The screens a patch arranges (an empty list, a reset, counts). */
export function patchedLayoutScreens(patch: UserSettingsPatch): CardScreen[] {
  return CARD_SCREENS.filter((screen) => patch.cardLayouts?.[screen] !== undefined);
}

function scalarKeys(patch: UserSettingsPatch): (keyof Omit<UserSettings, "cardLayouts">)[] {
  return (Object.keys(patch) as (keyof UserSettingsPatch)[]).filter(
    (key): key is keyof Omit<UserSettings, "cardLayouts"> =>
      key !== "cardLayouts" && patch[key] !== undefined,
  );
}

export function snapshotPatchedKeys(
  settings: UserSettings,
  patch: UserSettingsPatch,
): PatchedKeysSnapshot {
  const snapshot: PatchedKeysSnapshot = { scalars: {}, layouts: {} };
  for (const key of scalarKeys(patch)) {
    (snapshot.scalars as Record<string, unknown>)[key] = settings[key];
  }
  for (const screen of patchedLayoutScreens(patch)) {
    snapshot.layouts[screen] = settings.cardLayouts[screen];
  }
  return snapshot;
}

/**
 * Puts back only what a failed patch changed, on top of the settings as they are now, so a save
 * that went through in the meantime (another toggle, another screen's order) survives. A key is
 * restored only while it still holds what the failed patch set: if a newer save changed it again,
 * that newer value wins.
 *
 * `keepLayouts`: leave the arranged orders alone (the save will be retried, the order stays).
 */
export function rollbackPatchedKeys(
  current: UserSettings,
  patch: UserSettingsPatch,
  snapshot: PatchedKeysSnapshot,
  { keepLayouts }: { keepLayouts: boolean },
): UserSettings {
  const next: UserSettings = { ...current };
  for (const key of scalarKeys(patch)) {
    if (Object.is(current[key], patch[key])) {
      (next as Record<string, unknown>)[key] = snapshot.scalars[key];
    }
  }
  if (!keepLayouts) {
    const layouts: CardLayouts = { ...current.cardLayouts };
    for (const screen of patchedLayoutScreens(patch)) {
      const set = patch.cardLayouts?.[screen] ?? [];
      if (!sameOrder(current.cardLayouts[screen] ?? [], set)) {
        continue;
      }
      const before = snapshot.layouts[screen];
      if (before === undefined) {
        delete layouts[screen];
      } else {
        layouts[screen] = before;
      }
    }
    next.cardLayouts = layouts;
  }
  return next;
}

/**
 * Server settings with the arranged orders that are still waiting to be sent (`pending` screens)
 * taken from the local copy: a fresh answer from the server must not undo an order it has not
 * heard about yet.
 */
export function overlayPendingLayouts(
  fresh: UserSettings,
  local: UserSettings | undefined,
  pending: readonly CardScreen[],
): UserSettings {
  if (!local || pending.length === 0) {
    return fresh;
  }
  const layouts: CardLayouts = { ...fresh.cardLayouts };
  for (const screen of pending) {
    const ids = local.cardLayouts[screen];
    if (ids === undefined) {
      delete layouts[screen];
    } else {
      layouts[screen] = ids;
    }
  }
  return { ...fresh, cardLayouts: layouts };
}
