import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export function configureExpoNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS !== "android") {
    return;
  }

  void Notifications.setNotificationChannelAsync("dime-alerts", {
    name: "Dime alerts",
    importance: Notifications.AndroidImportance.MAX,
  });
}

