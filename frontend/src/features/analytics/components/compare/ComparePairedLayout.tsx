import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { TwoToneCard } from "@/components/shared";
import { bento, colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

export type ComparePairedLayoutProps = {
  title: string;
  subtitle: string;
  leftLabel: string;
  rightLabel: string;
  footer?: ReactNode;
  children: ReactNode;
};

export const CompareColumnHeaders = memo(function CompareColumnHeaders({
  leftLabel,
  rightLabel,
}: {
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <View style={styles.columnHeaders}>
      <Text style={styles.columnHeaderLabel} numberOfLines={1}>
        {leftLabel}
      </Text>
      <Text style={styles.columnHeaderLabel} numberOfLines={1}>
        {rightLabel}
      </Text>
    </View>
  );
});

export const ComparePairedColumns = memo(function ComparePairedColumns({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <View style={styles.pairedRow}>
      <View style={styles.column}>{left}</View>
      <View style={styles.columnDivider} />
      <View style={styles.column}>{right}</View>
    </View>
  );
});

export const ComparePairedLayout = memo(function ComparePairedLayout({
  title,
  subtitle,
  leftLabel,
  rightLabel,
  footer,
  children,
}: ComparePairedLayoutProps) {
  return (
    <TwoToneCard
      header={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
      }
      body={
        <View style={styles.body}>
          <CompareColumnHeaders leftLabel={leftLabel} rightLabel={rightLabel} />
          {children}
          {footer}
        </View>
      }
    />
  );
});

export const CompareColumnError = memo(function CompareColumnError() {
  return <Text style={styles.columnError}>Could not load</Text>;
});

export const CompareColumnEmpty = memo(function CompareColumnEmpty({
  message,
}: {
  message: string;
}) {
  return <Text style={styles.columnEmpty}>{message}</Text>;
});

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.primary,
  },
  headerSubtitle: {
    marginTop: 2,
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: bento.onPastel.muted,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  columnHeaders: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  columnHeaderLabel: {
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  pairedRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  columnDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: colors.borderList,
    marginHorizontal: spacing.xs,
  },
  columnError: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.danger,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
  columnEmpty: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: bento.onPastel.muted,
    textAlign: "center",
    paddingVertical: spacing.sm,
  },
});
