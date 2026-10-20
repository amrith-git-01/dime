import { Alert } from "react-native";

import { getAppPermissionStatus, type AppPermissionId } from "./appPermissions";

/** A small in-app prompt that resolves true when the user agrees to go on. */
export function confirmReasonAlert({
  title,
  message,
  confirmLabel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: confirmLabel, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

const CAPTURE_REASONS = {
  camera: {
    title: "Camera",
    message: "Dime needs the camera to read your receipt.",
  },
  microphone: {
    title: "Microphone",
    message: "Dime needs the microphone to hear your expense.",
  },
} as const;

/**
 * Before the FIRST system dialog for the camera or microphone (status undetermined), says why in
 * one line. Resolves false when the user chooses "Not now", so the caller can stop without
 * asking the system. Any other status (granted, or already answered) goes straight through, and
 * the caller's own denial handling takes over.
 */
export async function confirmCapturePermissionReason(
  id: Extract<AppPermissionId, keyof typeof CAPTURE_REASONS>,
): Promise<boolean> {
  if ((await getAppPermissionStatus(id)) !== "undetermined") {
    return true;
  }
  return confirmReasonAlert({ ...CAPTURE_REASONS[id], confirmLabel: "Continue" });
}
