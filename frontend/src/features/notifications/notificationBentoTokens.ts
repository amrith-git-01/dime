import type { LucideIcon } from "lucide-react-native";
import { AlertTriangle, ScanLine } from "lucide-react-native";

import { colors, surfaces } from "@/constants";

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
