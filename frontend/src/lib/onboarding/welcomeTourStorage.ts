import { createMMKV } from "react-native-mmkv";

const onboardingMmkv = createMMKV({ id: "dime-onboarding" });

const WELCOME_TOUR_COMPLETED_KEY = "welcome_tour.completed";

export function getWelcomeTourCompleted(): boolean {
  return onboardingMmkv.getBoolean(WELCOME_TOUR_COMPLETED_KEY) ?? false;
}

export function setWelcomeTourCompleted(): void {
  onboardingMmkv.set(WELCOME_TOUR_COMPLETED_KEY, true);
}
