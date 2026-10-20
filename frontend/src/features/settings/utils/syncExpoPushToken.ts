import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

import {
  getAppPermissionState,
  requestAppPermission,
} from "@/features/onboarding/utils/appPermissions";

import { deletePushToken, putPushToken } from "../api/pushTokenApi";
import { reportError } from "@/lib/reportError";

function getExpoProjectId(): string | null {
  const easProjectId = Constants.easConfig?.projectId;
  const legacyProjectId = (
    Constants.expoConfig?.extra as
      | { eas?: { projectId?: string } }
      | undefined
  )?.eas?.projectId;
  return easProjectId ?? legacyProjectId ?? null;
}

let warnedPushUnavailable = false;

/**
 * FCM is not configured (no google-services.json in the build): the native layer throws
 * "Default FirebaseApp is not initialized". This is an expected, non-fatal setup state.
 */
/** The user declined (or hasn't granted) notifications: an expected state, not a failure to report. */
export class PushPermissionDeniedError extends Error {
  constructor() {
    super("[syncExpoPushToken] Notifications permission not granted");
    this.name = "PushPermissionDeniedError";
  }
}

export function isPushNotConfiguredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /FirebaseApp|fcm-credentials|FCM|firebase/i.test(message);
}

function warnPushUnavailableOnce(): void {
  if (warnedPushUnavailable) {
    return;
  }
  warnedPushUnavailable = true;
  console.warn(
    "[syncExpoPushToken] Push is not configured (Firebase/FCM missing); skipping remote push registration. Local reminders still work.",
  );
}

async function getExpoPushToken(projectId: string): Promise<string> {
  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = result.data;

  if (!token || typeof token !== "string") {
    throw new Error("[syncExpoPushToken] Expo push token is empty");
  }

  return token;
}

export type SyncExpoPushTokenOptions = {
  /** Sign-out clean-up: credentials captured before the session was cleared. */
  authorization?: string;
  timeoutMs?: number;
  /**
   * Enabling only. True (the default) shows the system permission dialog when needed; false
   * registers the token only if notifications are already allowed and otherwise throws
   * {@link PushPermissionDeniedError}, so background syncs never pop a dialog.
   */
  requestPermission?: boolean;
};

export async function syncExpoPushTokenForUser(
  enabled: boolean,
  options?: SyncExpoPushTokenOptions,
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
        if (isPushNotConfiguredError(error)) {
          warnPushUnavailableOnce();
        } else {
          reportError(
            error,
            "syncExpoPushToken could not read token before delete",
          );
        }
      }
    }

    await deletePushToken(token, options);
    return;
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    throw new Error("[syncExpoPushToken] Missing Expo projectId");
  }

  const granted =
    options?.requestPermission === false
      ? (await getAppPermissionState("notifications")).granted
      : await requestAppPermission("notifications");
  if (!granted) {
    throw new PushPermissionDeniedError();
  }

  let token: string;
  try {
    token = await getExpoPushToken(projectId);
  } catch (error) {
    if (isPushNotConfiguredError(error)) {
      warnPushUnavailableOnce();
      return;
    }
    throw error;
  }
  await putPushToken(token);
}

