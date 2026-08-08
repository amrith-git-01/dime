import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { getAppPermissionState } from "@/features/onboarding/utils/appPermissions";

import { parseReminderTime } from "./parseReminderTime";

export const DAILY_EXPENSE_REMINDER_ID = "dime-daily-expense-reminder";

export type SyncDailyExpenseReminderArgs = {
  enabled: boolean;
  time: string; // HH:mm
  deviceNotificationsEnabled: boolean;
};

export async function cancelDailyExpenseReminderSchedule(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(
    DAILY_EXPENSE_REMINDER_ID,
  );
}

export async function syncDailyExpenseReminderSchedule(
  args: SyncDailyExpenseReminderArgs,
): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  try {
    await cancelDailyExpenseReminderSchedule();
  } catch {
    // ignore missing id
  }

  const parsed = parseReminderTime(args.time);
  if (!args.enabled || !args.deviceNotificationsEnabled || !parsed) {
    return;
  }

  const permission = await getAppPermissionState("notifications");
  if (!permission.granted) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_EXPENSE_REMINDER_ID,
    content: {
      title: "Log today's expenses",
      body: "Got a minute? Add what you spent today.",
      sound: true,
      data: {
        kind: "daily_expense_reminder",
        action_type: "manual_add",
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: parsed.hour,
      minute: parsed.minute,
      channelId: "dime-alerts",
    },
  });
}
