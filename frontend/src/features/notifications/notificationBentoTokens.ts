import type { LucideIcon } from "lucide-react-native";
import { AlertTriangle, ScanLine } from "lucide-react-native";

import { colors, surfaces } from "@/constants";

import type { NotificationKind } from "./types";

/** Inbox row copy — unread vs read (no dot indicator). */
export const NOTIFICATION_INBOX_TEXT = {
  unread: {
    title: colors.textListPrimary,
    body: colors.textSecondary,
    time: colors.textListSecondary,
  },
  read: {
    title: colors.textListSecondary,
    body: colors.inactive,
    time: colors.inactive,
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
    iconColor: colors.success,
    backgroundColor: surfaces.successTint14,
  },
  delete: {
    iconColor: colors.danger,
    backgroundColor: surfaces.dangerTint08,
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
    iconColor: colors.iconAccentSky,
  },
  budget_threshold: {
    icon: AlertTriangle,
    backgroundColor: surfaces.iconWellOrange,
    iconColor: colors.iconAccentOrange,
  },
  capture_failed: {
    icon: AlertTriangle,
    backgroundColor: surfaces.iconWellDanger,
    iconColor: colors.danger,
  },
};
