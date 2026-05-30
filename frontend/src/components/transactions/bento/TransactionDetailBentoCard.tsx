import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, layout, spacing } from "@/constants/theme";

type TransactionDetailBentoCardProps = {
  title?: string;
  children: ReactNode;
};

export function TransactionDetailBentoCard({
  title,
  children,
}: TransactionDetailBentoCardProps) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

type TransactionDetailFieldProps = {
  label: string;
  children: ReactNode;
  isLast?: boolean;
};

export function TransactionDetailField({
  label,
  children,
  isLast,
}: TransactionDetailFieldProps) {
  return (
    <View style={[styles.field, isLast && styles.fieldLast]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...layout.cardCompact,
    gap: 0,
  },
  cardTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  field: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  fieldLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  fieldLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
});
