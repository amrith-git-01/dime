import * as Notifications from "expo-notifications";

export type NotificationPermissionLabel =
  | "Allowed"
  | "Not allowed"
  | "Not decided"
  | "Limited"
  | "Unavailable";

/**
 * Maps expo-notifications permission status to a short settings display label.
 */
export function labelForNotificationPermissionStatus(
  status: Notifications.NotificationPermissionsStatus,
): NotificationPermissionLabel {
  if (status.granted) {
    return "Allowed";
  }

  const iosStatus = status.ios?.status;
  if (
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  ) {
    return "Limited";
  }

  if (status.status === Notifications.PermissionStatus.DENIED) {
    return "Not allowed";
  }

  if (status.status === Notifications.PermissionStatus.UNDETERMINED) {
    return "Not decided";
  }

  return "Unavailable";
}

export async function fetchNotificationPermissionLabel(): Promise<NotificationPermissionLabel> {
  const status = await Notifications.getPermissionsAsync();
  return labelForNotificationPermissionStatus(status);
}
