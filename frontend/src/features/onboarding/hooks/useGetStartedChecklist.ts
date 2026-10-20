import { useIsFocused } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { isAppTourSeen, useAppTourStore } from "@/features/appTour/store/appTourStore";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import {
  getChecklistPersisted,
  setChecklistPersisted,
} from "@/lib/onboarding/checklistStorage";
import { getStoredGoal } from "@/lib/onboarding/goalStorage";

import { CHECKLIST_ITEM_IDS } from "../constants/checklistItems";
import type { ChecklistItemId } from "../types";
import {
  checklistFlags,
  type ChecklistPersisted,
  countDone,
  EMPTY_CHECKLIST_PERSISTED,
  isChecklistVisible,
  observeChecklist,
  orderChecklistItems,
  resolveDone,
} from "../utils/checklist";

import { useOnboardingProgressQuery } from "./useOnboardingProgressQuery";
import { useWidgetAdded } from "./useWidgetAdded";

/** How long "You're a Dime pro" stays before the card retires for good. */
export const CHECKLIST_PRO_MS = 4000;

/**
 * State of the Home "Get started" card: which items are done, in which order, whether the card shows,
 * and which items just turned done in front of the user (those get a burst and a check draw).
 *
 * Done comes from the server progress and the device's widget flag; items once seen done stay done.
 * Only transitions seen while Home is focused, with the tour not running, celebrate: a first look
 * at the card records what is already done silently.
 */
export function useGetStartedChecklist() {
  const { userId } = useSessionUserId();
  const tourActive = useAppTourStore((s) => s.active);
  const isFocused = useIsFocused();
  const progress = useOnboardingProgressQuery();
  const widgetAdded = useWidgetAdded(isFocused);

  // Storage is synchronous (MMKV); the state mirrors it and is re-read when the account changes.
  const readPersisted = (id: string | undefined) =>
    id ? getChecklistPersisted(id) : EMPTY_CHECKLIST_PERSISTED;
  const [stored, setStored] = useState(() => ({
    userId,
    persisted: readPersisted(userId),
  }));
  const [justDone, setJustDone] = useState<ChecklistItemId[]>([]);
  const [proShowing, setProShowing] = useState(false);
  if (stored.userId !== userId) {
    // Another account: nothing from the previous one's celebration carries over.
    setStored({ userId, persisted: readPersisted(userId) });
    setJustDone([]);
    setProShowing(false);
  }
  const persisted = stored.persisted;
  const save = useCallback(
    (next: ChecklistPersisted) => {
      if (userId) {
        setChecklistPersisted(userId, next);
        setStored({ userId, persisted: next });
      }
    },
    [userId],
  );

  const flags = useMemo(
    () => checklistFlags(progress.data, widgetAdded),
    [progress.data, widgetAdded],
  );
  const done = useMemo(() => resolveDone(flags, persisted), [flags, persisted]);

  // A new account's card waits for the tour (it would flash in, then be hidden when the tour starts).
  // Read through a store subscription: a plain call would be memoized by the compiler and never see the skip.
  const tourSeen = useSyncExternalStore(useAppTourStore.subscribe, () => isAppTourSeen(userId));
  const tourPending = !tourSeen;
  const loaded = progress.data !== undefined;
  const observing =
    loaded &&
    isFocused &&
    !tourActive &&
    !tourPending &&
    !proShowing &&
    !persisted.hidden &&
    !persisted.retired;

  useEffect(() => {
    if (!observing) {
      return;
    }
    const result = observeChecklist(flags, persisted);
    if (result.persisted !== persisted) {
      save(result.persisted);
    }
    if (result.celebrate.length > 0) {
      setJustDone(result.celebrate);
    }
    if (result.showPro) {
      setProShowing(true);
    }
  }, [observing, flags, persisted, save]);

  // The all-done celebration plays for a few seconds, then the card is retired for good.
  useEffect(() => {
    if (!proShowing || !userId) {
      return;
    }
    const timer = setTimeout(() => {
      save({ ...getChecklistPersisted(userId), retired: true });
      setProShowing(false);
    }, CHECKLIST_PRO_MS);
    return () => clearTimeout(timer);
  }, [proShowing, userId, save]);

  const items = useMemo(
    () => orderChecklistItems(userId ? getStoredGoal(userId)?.goal : null),
    [userId],
  );

  const visible =
    loaded &&
    !tourPending &&
    isChecklistVisible({ persisted, done, tourActive, proShowing });

  const hide = useCallback(() => {
    if (userId) {
      save({ ...getChecklistPersisted(userId), hidden: true });
    }
  }, [save, userId]);

  const clearJustDone = useCallback(() => setJustDone([]), []);

  return {
    visible,
    items,
    done,
    doneCount: countDone(done),
    total: CHECKLIST_ITEM_IDS.length,
    justDone,
    proShowing,
    hide,
    clearJustDone,
  };
}
