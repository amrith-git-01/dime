import { createMMKV } from "react-native-mmkv";

/** Device-level, like the OS permission itself: not wiped on sign-out. */
const onboardingMmkv = createMMKV({ id: "dime-onboarding" });

const NOTIFICATIONS_ASKED_KEY = "permissions.notifications_asked_in_context";

/** True once the in-app "why we want notifications" prompt has been shown on this device. */
export function hasAskedNotificationsInContext(): boolean {
  return onboardingMmkv.getString(NOTIFICATIONS_ASKED_KEY) !== undefined;
}

export function markAskedNotificationsInContext(): void {
  onboardingMmkv.set(NOTIFICATIONS_ASKED_KEY, new Date().toISOString());
}
