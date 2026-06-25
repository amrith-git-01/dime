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

export async function getAllAppPermissionStates(): Promise<
  AppPermissionState[]
> {
  const ids: AppPermissionId[] = ["notifications", "camera", "microphone"];
  return Promise.all(ids.map((id) => getAppPermissionState(id)));
}

const PERMISSION_REQUEST_ORDER: AppPermissionId[] = [
  "notifications",
  "camera",
  "microphone",
];

/** Requests each native permission dialog in sequence (skips already granted). */
export async function requestAllAppPermissionsSequentially(): Promise<void> {
  for (const id of PERMISSION_REQUEST_ORDER) {
    const state = await getAppPermissionState(id);
    if (state.available && !state.granted) {
      await requestAppPermission(id);
    }
  }
}
