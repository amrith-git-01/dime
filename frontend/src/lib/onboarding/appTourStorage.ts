import { createMMKV } from "react-native-mmkv";

/** Device-level onboarding flags (the file the retired welcome carousel used); tour keys are per user, so sign-out need not wipe it. */
const onboardingMmkv = createMMKV({ id: "dime-onboarding" });

/** The first-expense tour kept its original key, so accounts that already finished it stay done. */
const completedKey = (userId: string) => `app_tour.completed.v1:${userId}`;
/** One key per tab / feature tour. */
const tabSeenKey = (tourId: string, userId: string) =>
  `app_tour.tab.v1:${tourId}:${userId}`;
const masterKey = (userId: string) => `app_tour.master.v1:${userId}`;
const masterShineKey = (userId: string) => `app_tour.master_shine.v1:${userId}`;

const listeners = new Set<() => void>();

/** For `useSyncExternalStore`: UI (the "?" button, Settings → Tours) reacts when a tour becomes seen. */
export function subscribeTourSeen(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getAppTourCompleted(userId: string): boolean {
  return onboardingMmkv.getString(completedKey(userId)) !== undefined;
}

/** Stores when the first-expense tour was finished or skipped (ISO timestamp). */
export function setAppTourCompleted(userId: string): void {
  onboardingMmkv.set(completedKey(userId), new Date().toISOString());
  notify();
}

export function getTabTourSeen(tourId: string, userId: string): boolean {
  return onboardingMmkv.getString(tabSeenKey(tourId, userId)) !== undefined;
}

/** Stores when a tab tour was watched to its end or skipped (ISO timestamp). */
export function setTabTourSeen(tourId: string, userId: string): void {
  onboardingMmkv.set(tabSeenKey(tourId, userId), new Date().toISOString());
  notify();
}

/** When the user finished every tour ("Tour master"), if they did. */
export function getTourMasterAt(userId: string): string | undefined {
  return onboardingMmkv.getString(masterKey(userId));
}

export function setTourMasterAt(userId: string): void {
  if (onboardingMmkv.getString(masterKey(userId)) === undefined) {
    onboardingMmkv.set(masterKey(userId), new Date().toISOString());
    notify();
  }
}

/** The badge's shine plays the first time it is seen in Settings; this remembers that it did. */
export function getTourMasterShineSeen(userId: string): boolean {
  return onboardingMmkv.getString(masterShineKey(userId)) !== undefined;
}

export function setTourMasterShineSeen(userId: string): void {
  onboardingMmkv.set(masterShineKey(userId), new Date().toISOString());
}
