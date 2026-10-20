import {
  performConfirmHaptic,
  performHaptic,
  performTickHaptic,
} from "./hapticEngine";
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

/** Success haptic for celebrations (Android Confirm); respects the haptic preference. */
export async function triggerConfirmHaptic(): Promise<void> {
  if (!getHapticFeedbackEnabled()) {
    return;
  }
  await performConfirmHaptic();
}

/** Light tick for tour steps and bursts (Android Segment_Tick); respects the haptic preference. */
export async function triggerTickHaptic(): Promise<void> {
  if (!getHapticFeedbackEnabled()) {
    return;
  }
  await performTickHaptic();
}

export { performHaptic } from "./hapticEngine";
