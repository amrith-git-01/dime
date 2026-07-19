import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { requestAppPermission } from "@/features/onboarding/utils/appPermissions";

import { deletePushToken, putPushToken } from "../api/pushTokenApi";

function getExpoProjectId(): string | null {
  const easProjectId = Constants.easConfig?.projectId;
  const legacyProjectId = (Constants.expoConfig as any)?.extra?.eas?.projectId;
  return easProjectId ?? legacyProjectId ?? null;
}

async function getExpoPushToken(projectId: string): Promise<string> {
  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  const token =
    typeof (result as any).data === "string" ? (result as any).data : result;

  if (!token || typeof token !== "string") {
    throw new Error("[syncExpoPushToken] Expo push token is empty");
  }

  return token;
}

export async function syncExpoPushTokenForUser(
  enabled: boolean,
): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  if (!enabled) {
    const projectId = getExpoProjectId();

    let token: string | undefined;
    if (projectId) {
      try {
        token = await getExpoPushToken(projectId);
      } catch (error) {
        console.warn(
          "[syncExpoPushToken] Could not read Expo push token before delete",
          error,
        );
      }
    }

    await deletePushToken(token);
    return;
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    throw new Error("[syncExpoPushToken] Missing Expo projectId");
  }

  const granted = await requestAppPermission("notifications");
  if (!granted) {
    throw new Error("[syncExpoPushToken] Notifications permission not granted");
  }

  const token = await getExpoPushToken(projectId);
  await putPushToken(token);
}

