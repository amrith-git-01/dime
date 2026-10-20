import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Low-level haptic trigger — always fires when the device supports it.
 * Android uses semantic haptic feedback (not Vibrator). Prefer {@link triggerHaptic}.
 */
export async function performHaptic(): Promise<void> {
  try {
    if (Platform.OS === "android") {
      await Haptics.performAndroidHapticsAsync(
        Haptics.AndroidHaptics.Context_Click,
      );
    }
  } catch {
    // Device does not support native haptics -> intentionally no fallback.
  }
}

/** A "that worked" haptic for celebrations. Prefer {@link triggerConfirmHaptic}. */
export async function performConfirmHaptic(): Promise<void> {
  try {
    if (Platform.OS === "android") {
      await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  } catch {
    // Device does not support native haptics -> intentionally no fallback.
  }
}

/** A light tick (a step changed, a burst fired). Prefer {@link triggerTickHaptic}. */
export async function performTickHaptic(): Promise<void> {
  try {
    if (Platform.OS === "android") {
      await Haptics.performAndroidHapticsAsync(
        Haptics.AndroidHaptics.Segment_Tick,
      );
    } else {
      await Haptics.selectionAsync();
    }
  } catch {
    // Device does not support native haptics -> intentionally no fallback.
  }
}
