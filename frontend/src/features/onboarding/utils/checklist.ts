import {
  CHECKLIST_ITEM_IDS,
  GOAL_PRIORITY_ITEM,
} from "../constants/checklistItems";
import type {
  ChecklistItemId,
  OnboardingGoal,
  OnboardingProgress,
} from "../types";

export type ChecklistFlags = Record<ChecklistItemId, boolean>;

/** What is remembered per user on the device between launches. */
export type ChecklistPersisted = {
  /** The card has rendered once: items already done at that moment were ticked silently. */
  baselined: boolean;
  /** Items already seen as done (celebrated, or done before the card first showed). Never shrinks. */
  seen: ChecklistItemId[];
  /** The user tapped Hide. */
  hidden: boolean;
  /** All done and celebrated (or done before the card first showed): the card never comes back. */
  retired: boolean;
};

export const EMPTY_CHECKLIST_PERSISTED: ChecklistPersisted = {
  baselined: false,
  seen: [],
  hidden: false,
  retired: false,
};

/** Done flags from the server progress plus the device's widget flag; nothing is done until progress loaded. */
export function checklistFlags(
  progress: OnboardingProgress | undefined,
  widgetAdded: boolean,
): ChecklistFlags {
  return {
    firstExpense: progress?.first_expense ?? false,
    voiceOrScan: progress?.voice_or_scan ?? false,
    budget: progress?.budget ?? false,
    recurring: progress?.recurring ?? false,
    widget: widgetAdded,
    askAi: progress?.asked_ai ?? false,
  };
}

/**
 * Row order: the first expense leads; a goal moves its item up to second place ("Stick to a budget"
 * puts the budget there, "Save for something" the recurring item); the rest keep their order.
 */
export function orderChecklistItems(
  goal: OnboardingGoal | null | undefined,
): ChecklistItemId[] {
  const priority = goal ? GOAL_PRIORITY_ITEM[goal] : undefined;
  if (!priority) {
    return [...CHECKLIST_ITEM_IDS];
  }
  const [lead, ...rest] = CHECKLIST_ITEM_IDS.filter((id) => id !== priority);
  return lead ? [lead, priority, ...rest] : [priority];
}

/** What a row shows: done now, or seen done before (deleting the expense later does not untick it). */
export function resolveDone(
  flags: ChecklistFlags,
  persisted: ChecklistPersisted,
): ChecklistFlags {
  const done = { ...flags };
  for (const id of persisted.seen) {
    done[id] = true;
  }
  return done;
}

export function countDone(done: ChecklistFlags): number {
  return CHECKLIST_ITEM_IDS.filter((id) => done[id]).length;
}

export function allChecklistDone(done: ChecklistFlags): boolean {
  return CHECKLIST_ITEM_IDS.every((id) => done[id]);
}

export type ChecklistObservation = {
  persisted: ChecklistPersisted;
  /** Items that went from not done to done in front of the user: each gets its burst and check. */
  celebrate: ChecklistItemId[];
  /** The last item just got done in front of the user: show "You're a Dime pro", then retire. */
  showPro: boolean;
};

/**
 * One observation of the card while the user can see it. The first one only records what is already
 * done (no celebration for old progress). Later ones celebrate each item the first time it is seen
 * done, and flag the "all done" moment. All done without a transition retires the card silently.
 */
export function observeChecklist(
  flags: ChecklistFlags,
  persisted: ChecklistPersisted,
): ChecklistObservation {
  const doneIds = CHECKLIST_ITEM_IDS.filter((id) => flags[id]);

  if (!persisted.baselined) {
    const next: ChecklistPersisted = {
      ...persisted,
      baselined: true,
      seen: [...new Set([...persisted.seen, ...doneIds])],
    };
    return {
      persisted: allChecklistDone(resolveDone(flags, next))
        ? { ...next, retired: true }
        : next,
      celebrate: [],
      showPro: false,
    };
  }

  const celebrate = doneIds.filter((id) => !persisted.seen.includes(id));
  const next: ChecklistPersisted = celebrate.length
    ? { ...persisted, seen: [...persisted.seen, ...celebrate] }
    : persisted;
  if (!allChecklistDone(resolveDone(flags, next))) {
    return { persisted: next, celebrate, showPro: false };
  }
  const showPro = celebrate.length > 0;
  return {
    persisted: showPro ? next : { ...next, retired: true },
    celebrate,
    showPro,
  };
}

/**
 * Whether the card is on Home. It leaves while the guided tour runs, once the user hides it, and once
 * every item is done (except for the few seconds of the "all done" celebration).
 */
export function isChecklistVisible(input: {
  persisted: ChecklistPersisted;
  done: ChecklistFlags;
  tourActive: boolean;
  /** The "You're a Dime pro" celebration is playing. */
  proShowing: boolean;
}): boolean {
  const { persisted, done, tourActive, proShowing } = input;
  if (persisted.hidden || persisted.retired || tourActive) {
    return false;
  }
  return proShowing || !allChecklistDone(done);
}

/** Screen-reader label of a row: what it is and whether it is done. */
export function checklistRowLabel(label: string, done: boolean): string {
  return `${label}, ${done ? "done" : "not done yet"}`;
}
