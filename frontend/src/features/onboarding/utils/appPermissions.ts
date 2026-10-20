import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";

export type AppPermissionId = "notifications" | "camera" | "microphone";

export type AppPermissionState = {
  id: AppPermissionId;
  granted: boolean;
  available: boolean;
};

function isNotificationGranted(
  status: Notifications.NotificationPermissionsStatus,
): boolean {
  return (
    status.granted ||
    status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export type AppPermissionStatus = "granted" | "denied" | "undetermined";

/** `status` is an enum in each module; comparing by its string value keeps this module-agnostic. */
function toPermissionStatus(response: {
  granted: boolean;
  status: unknown;
}): AppPermissionStatus {
  if (response.granted) {
    return "granted";
  }
  return String(response.status) === "undetermined" ? "undetermined" : "denied";
}

/** Whether the system dialog for `id` has never been answered (so asking now shows it). */
export async function getAppPermissionStatus(
  id: AppPermissionId,
): Promise<AppPermissionStatus> {
  switch (id) {
    case "notifications": {
      const status = await Notifications.getPermissionsAsync();
      return toPermissionStatus({
        granted: isNotificationGranted(status),
        status: status.status,
      });
    }
    case "camera":
      return toPermissionStatus(await ImagePicker.getCameraPermissionsAsync());
    case "microphone":
      return toPermissionStatus(await getRecordingPermissionsAsync());
    default:
      return "denied";
  }
}

export async function getAppPermissionState(
  id: AppPermissionId,
): Promise<AppPermissionState> {
  switch (id) {
    case "notifications": {
      const status = await Notifications.getPermissionsAsync();
      return {
        id,
        granted: isNotificationGranted(status),
        available: true,
      };
    }
    case "camera": {
      const status = await ImagePicker.getCameraPermissionsAsync();
      return {
        id,
        granted: status.granted,
        available: true,
      };
    }
    case "microphone": {
      const status = await getRecordingPermissionsAsync();
      return {
        id,
        granted: status.granted,
        available: true,
      };
    }
    default:
      return { id, granted: false, available: false };
  }
}

export async function requestAppPermission(
  id: AppPermissionId,
): Promise<boolean> {
  switch (id) {
    case "notifications": {
      const status = await Notifications.requestPermissionsAsync();
      return isNotificationGranted(status);
    }
    case "camera": {
      const status = await ImagePicker.requestCameraPermissionsAsync();
      return status.granted;
    }
    case "microphone": {
      const status = await requestRecordingPermissionsAsync();
      return status.granted;
    }
    default:
      return false;
  }
}
