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
