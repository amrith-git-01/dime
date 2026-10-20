import { createMMKV } from "react-native-mmkv";

/** Device-level onboarding flags (the file the retired welcome carousel used); tour keys are per user, so sign-out need not wipe it. */
const onboardingMmkv = createMMKV({ id: "dime-onboarding" });

const completedKey = (userId: string) => `app_tour.completed.v1:${userId}`;

export function getAppTourCompleted(userId: string): boolean {
  return onboardingMmkv.getString(completedKey(userId)) !== undefined;
}

/** Stores when the tour was finished or skipped (ISO timestamp). */
export function setAppTourCompleted(userId: string): void {
  onboardingMmkv.set(completedKey(userId), new Date().toISOString());
}
