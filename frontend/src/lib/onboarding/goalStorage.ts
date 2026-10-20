import { createMMKV } from "react-native-mmkv";

import type { OnboardingGoal } from "@/features/onboarding/types";

/** Per-user keys in the device-level onboarding store; the goal never leaves the device. */
const onboardingMmkv = createMMKV({ id: "dime-onboarding" });

const goalKey = (userId: string) => `goal.v1:${userId}`;

const GOALS: readonly OnboardingGoal[] = ["track", "budget", "save"];

export type StoredGoal = {
  goal: OnboardingGoal;
  /** Monthly budget (₹) typed in the goal step; offered again if saving it failed. */
  budgetAmount?: number;
};

export function getStoredGoal(userId: string): StoredGoal | null {
  const raw = onboardingMmkv.getString(goalKey(userId));
  if (raw === undefined) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredGoal> | null;
    if (!parsed || !GOALS.includes(parsed.goal as OnboardingGoal)) {
      return null;
    }
    const amount = parsed.budgetAmount;
    return {
      goal: parsed.goal as OnboardingGoal,
      ...(typeof amount === "number" && Number.isFinite(amount) && amount > 0
        ? { budgetAmount: amount }
        : {}),
    };
  } catch {
    return null;
  }
}

export function setStoredGoal(userId: string, value: StoredGoal): void {
  onboardingMmkv.set(goalKey(userId), JSON.stringify(value));
}
