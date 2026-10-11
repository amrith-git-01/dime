import { performHaptic } from "./hapticEngine";
import { getHapticFeedbackEnabled } from "./hapticPreferencesStorage";

/**
 * App-wide haptic feedback — respects the user's haptic preference.
 * Android: `performAndroidHapticsAsync` (Context_Click).
 */
export async function triggerHaptic(): Promise<void> {
  if (!getHapticFeedbackEnabled()) {
    return;
  }
  await performHaptic();
}

export { performHaptic } from "./hapticEngine";
