import type { LucideIcon } from "lucide-react-native";
import { AlertTriangle, Bell, FileBarChart, ScanLine } from "lucide-react-native";

import type { ThemeColors } from "@/theme";

import type { NotificationKind } from "./types";

/** Inbox row copy — unread vs read. */
export function getNotificationInboxText(colors: ThemeColors) {
  return {
    unread: {
      title: colors.ink,
      body: colors.inkSoft,
      time: colors.inkFaint,
    },
    read: {
      title: colors.inkSoft,
      body: colors.inkFaint,
      time: colors.inkFaint,
    },
  } as const;
}

export type NotificationRowVisual = {
  icon: LucideIcon;
  backgroundColor: string;
  iconColor: string;
};

export const NOTIFICATION_ICON_WELL_SIZE = 36;
export const NOTIFICATION_SWIPE_ACTION_WIDTH = 64;

export function getNotificationRowVisual(
  kind: NotificationKind,
  colors: ThemeColors,
): NotificationRowVisual {
  switch (kind) {
    case "transaction_auto":
      return {
        icon: ScanLine,
        backgroundColor: colors.surfaces.iconWellSky,
        iconColor: colors.iconAccentSky,
      };
    case "budget_threshold":
      return {
        icon: AlertTriangle,
        backgroundColor: colors.warningTint,
        iconColor: colors.warning,
      };
    case "capture_failed":
      return {
        icon: AlertTriangle,
        backgroundColor: colors.dangerTint,
        iconColor: colors.danger,
      };
    case "report_ready":
      return {
        icon: FileBarChart,
        backgroundColor: colors.accentTint,
        iconColor: colors.accent,
      };
    case "unknown":
    default:
      // A kind from a newer server: neutral well, the row still shows its own title and body.
      return {
        icon: Bell,
        backgroundColor: colors.surfaces.primaryTint10,
        iconColor: colors.inkSoft,
      };
  }
}
