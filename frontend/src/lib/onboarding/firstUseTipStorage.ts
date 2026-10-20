import { createMMKV } from "react-native-mmkv";

/** Device-level, like the OS permissions: a tip is shown once per device, not per account. */
const onboardingMmkv = createMMKV({ id: "dime-onboarding" });

export type FirstUseTipId =
  | "voice"
  | "scan"
  | "budgets"
  | "recurring"
  | "insights"
  | "askAi";

const seenKey = (tipId: FirstUseTipId) => `first_use_tip.seen.v1:${tipId}`;

export function hasSeenFirstUseTip(tipId: FirstUseTipId): boolean {
  return onboardingMmkv.getString(seenKey(tipId)) !== undefined;
}

const listeners = new Set<() => void>();

/** For `useSyncExternalStore`: tips on screen react when another tip (or the same one elsewhere) is dismissed. */
export function subscribeFirstUseTips(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stores when the tip was dismissed (ISO timestamp). */
export function markFirstUseTipSeen(tipId: FirstUseTipId): void {
  onboardingMmkv.set(seenKey(tipId), new Date().toISOString());
  listeners.forEach((listener) => listener());
}
