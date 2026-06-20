import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Bell,
  Camera,
  Check,
  MessageSquare,
  Mic,
  type LucideIcon,
} from "lucide-react-native";

import { colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import type { AppPermissionId } from "../constants/appPermissionItems";

const ICONS: Record<AppPermissionId, LucideIcon> = {
  sms: MessageSquare,
  notifications: Bell,
  camera: Camera,
  microphone: Mic,
};

export type PermissionSetupRowProps = {
  id: AppPermissionId;
  title: string;
  description: string;
  granted: boolean;
  unavailable?: boolean;
  requesting?: boolean;
  onRequest: () => void;
  showSeparator?: boolean;
};

export const PermissionSetupRow = memo(function PermissionSetupRow({
  id,
  title,
  description,
  granted,
  unavailable = false,
  requesting = false,
  onRequest,
  showSeparator = false,
}: PermissionSetupRowProps) {
  const Icon = ICONS[id];

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.iconWell}>
          <Icon color={colors.brandPrimary} size={20} strokeWidth={2} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.label}>{title}</Text>
          <Text style={styles.subtitle}>{description}</Text>
        </View>
        {granted ? (
          <View style={styles.grantedBadge}>
            <Check color={colors.success} size={16} strokeWidth={2.5} />
            <Text style={styles.grantedText}>Allowed</Text>
          </View>
        ) : unavailable ? (
          <Text style={styles.unavailableText}>N/A</Text>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={requesting}
            onPress={onRequest}
            style={({ pressed }) => [
              styles.grantButton,
              pressed ? styles.grantButtonPressed : null,
            ]}
          >
            <Text style={styles.grantButtonLabel}>
              {requesting ? "…" : "Allow"}
            </Text>
          </Pressable>
        )}
      </View>
      {showSeparator ? <View style={styles.separator} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 72,
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  label: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  grantButton: {
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.primary,
  },
  grantButtonPressed: {
    opacity: 0.9,
  },
  grantButtonLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 16,
    color: colors.textOnPrimary,
  },
  grantedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  grantedText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.success,
  },
  unavailableText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
