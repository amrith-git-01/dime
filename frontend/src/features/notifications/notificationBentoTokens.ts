import type { LucideIcon } from "lucide-react-native";
import { AlertTriangle, ScanLine } from "lucide-react-native";

import {
  danger,
  dangerTint,
  iconAccentSky,
  ink,
  inkFaint,
  inkSoft,
  surfaces,
  warning,
  warningTint,
} from "@/constants";

import type { NotificationKind } from "./types";

/** Inbox row copy — unread vs read. */
export const NOTIFICATION_INBOX_TEXT = {
  unread: {
    title: ink,
    body: inkSoft,
    time: inkFaint,
  },
  read: {
    title: inkSoft,
    body: inkFaint,
    time: inkFaint,
  },
} as const;

export type NotificationRowVisual = {
  icon: LucideIcon;
  backgroundColor: string;
  iconColor: string;
};

export const NOTIFICATION_ICON_WELL_SIZE = 36;
export const NOTIFICATION_SWIPE_ACTION_WIDTH = 64;

export const NOTIFICATION_ROW_VISUALS: Record<
  NotificationKind,
  NotificationRowVisual
> = {
  transaction_auto: {
    icon: ScanLine,
    backgroundColor: surfaces.iconWellSky,
    iconColor: iconAccentSky,
  },
  budget_threshold: {
    icon: AlertTriangle,
    backgroundColor: warningTint,
    iconColor: warning,
  },
  capture_failed: {
    icon: AlertTriangle,
    backgroundColor: dangerTint,
    iconColor: danger,
  },
};
