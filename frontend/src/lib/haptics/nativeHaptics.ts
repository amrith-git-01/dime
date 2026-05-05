import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Trigger haptics using native haptic engines only.
 * - Android: `performAndroidHapticsAsync` (no Vibrator fallback)
 * - iOS: UIFeedbackGenerator via impact APIs
 * - Unsupported devices: no-op
 */
export async function triggerLightHaptic(): Promise<void> {
  try {
    if (Platform.OS === "android") {
      await Haptics.performAndroidHapticsAsync(
        Haptics.AndroidHaptics.Context_Click,
      );
      return;
    }
    if (Platform.OS === "ios") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    // Device does not support native haptics -> intentionally no fallback.
  }
}

export async function triggerMediumHaptic(): Promise<void> {
  try {
    if (Platform.OS === "android") {
      await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm);
      return;
    }
    if (Platform.OS === "ios") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  } catch {
    // Device does not support native haptics -> intentionally no fallback.
  }
}
