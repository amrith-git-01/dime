import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { InsightsCard } from "../InsightsCard";
import { createThemedStyles } from "@/theme";

export type ComparePairedLayoutProps = {
  kicker: string;
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
  const styles = useStyles();
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
  const styles = useStyles();
  return (
    <View style={styles.pairedRow}>
      <View style={styles.column}>{left}</View>
      <View style={styles.columnDivider} />
      <View style={styles.column}>{right}</View>
    </View>
  );
});

export const ComparePairedLayout = memo(function ComparePairedLayout({
  kicker,
  subtitle,
  leftLabel,
  rightLabel,
  footer,
  children,
}: ComparePairedLayoutProps) {
  const styles = useStyles();
  return (
    <InsightsCard kicker={kicker} subtitle={subtitle}>
      <View style={styles.body}>
        <CompareColumnHeaders leftLabel={leftLabel} rightLabel={rightLabel} />
        {children}
        {footer}
      </View>
    </InsightsCard>
  );
});

export const CompareColumnError = memo(function CompareColumnError() {
  const styles = useStyles();
  return <Text style={styles.columnError}>Could not load</Text>;
});

const useStyles = createThemedStyles(({ colors }) => ({
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
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
    color: colors.inkSoft,
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
    backgroundColor: colors.line,
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
}));
