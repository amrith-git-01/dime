import type { LucideIcon } from "lucide-react-native";
import { AlertTriangle, ScanLine } from "lucide-react-native";

import {
  danger,
  dangerTint,
  iconAccentSky,
  ink,
  inkFaint,
  inkSoft,
  success,
  successTint,
  surfaces,
  warning,
  warningTint,
} from "@/constants";

import type { NotificationKind } from "./types";

/** Inbox row copy — unread vs read (no dot indicator). */
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

export type NotificationActionAccent = {
  iconColor: string;
  backgroundColor: string;
};

/** Circular tinted wells for row actions (mark read / delete). */
export const NOTIFICATION_ROW_ACTIONS = {
  markRead: {
    iconColor: success,
    backgroundColor: successTint,
  },
  delete: {
    iconColor: danger,
    backgroundColor: dangerTint,
  },
} as const satisfies Record<string, NotificationActionAccent>;

export const NOTIFICATION_ACTION_WELL_SIZE = 28;

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
