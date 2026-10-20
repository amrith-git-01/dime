import { createMMKV } from "react-native-mmkv";

import {
  EMPTY_CHECKLIST_PERSISTED,
  type ChecklistPersisted,
} from "@/features/onboarding/utils/checklist";
import { CHECKLIST_ITEM_IDS } from "@/features/onboarding/constants/checklistItems";
import type { ChecklistItemId } from "@/features/onboarding/types";

/** Per-user keys in the device-level onboarding store, so sign-out need not wipe it. */
const onboardingMmkv = createMMKV({ id: "dime-onboarding" });

const checklistKey = (userId: string) => `checklist.state.v1:${userId}`;

const isItemId = (value: unknown): value is ChecklistItemId =>
  CHECKLIST_ITEM_IDS.includes(value as ChecklistItemId);

/** The user's "Get started" state; anything missing or unreadable is the empty state. */
export function getChecklistPersisted(userId: string): ChecklistPersisted {
  const raw = onboardingMmkv.getString(checklistKey(userId));
  if (raw === undefined) {
    return EMPTY_CHECKLIST_PERSISTED;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ChecklistPersisted> | null;
    return {
      baselined: parsed?.baselined === true,
      seen: Array.isArray(parsed?.seen) ? parsed.seen.filter(isItemId) : [],
      hidden: parsed?.hidden === true,
      retired: parsed?.retired === true,
    };
  } catch {
    return EMPTY_CHECKLIST_PERSISTED;
  }
}

export function setChecklistPersisted(
  userId: string,
  state: ChecklistPersisted,
): void {
  onboardingMmkv.set(checklistKey(userId), JSON.stringify(state));
}
