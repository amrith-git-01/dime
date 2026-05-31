import type { LucideIcon } from "lucide-react-native";
import { AlertTriangle, Bell, ScanLine } from "lucide-react-native";

import { colors, surfaces } from "@/constants/theme";

import type { NotificationKind } from "./types";

export type NotificationRowVisual = {
  icon: LucideIcon;
  backgroundColor: string;
  iconColor: string;
};

export const NOTIFICATION_ROW_VISUALS: Record<
  NotificationKind,
  NotificationRowVisual
> = {
  transaction_auto: {
    icon: ScanLine,
    backgroundColor: "rgba(56, 189, 248, 0.18)",
    iconColor: "#0284C7",
  },
  budget_threshold: {
    icon: AlertTriangle,
    backgroundColor: "rgba(251, 146, 60, 0.2)",
    iconColor: "#EA580C",
  },
  capture_failed: {
    icon: AlertTriangle,
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    iconColor: colors.danger,
  },
};

export const NOTIFICATION_EMPTY_ICON = Bell;

export const NOTIFICATION_EMPTY_ACCENT = {
  backgroundColor: surfaces.primaryTint10,
  iconColor: colors.brandPrimary,
} as const;
