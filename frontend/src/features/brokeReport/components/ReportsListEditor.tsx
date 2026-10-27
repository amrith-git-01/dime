import { ChevronRight, Sparkles } from "lucide-react-native";
import { memo } from "react";
import { Text, View } from "react-native";

import { EmptyState } from "@/components/shared";
import { Button, SkeletonBlock } from "@/components/ui";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import {
  SettingsNavRow,
  SettingsSection,
} from "@/features/settings/components";
import { SETTINGS_SECTION_GAP } from "@/features/settings/constants/settingsTokens";
import { createThemedStyles, useTheme } from "@/theme";

import type { ReportListItem } from "../types";
import { monthName } from "../utils/reportFormat";

export type ReportsListEditorProps = {
  items: readonly ReportListItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpen: (periodKey: string) => void;
  onOpenSample: () => void;
};

function paymentsLabel(count: number): string {
  return `${count} ${count === 1 ? "payment" : "payments"}`;
}

/** Settings -> Broke Reports: every stored report, newest first, and a sample to preview. */
export const ReportsListEditor = memo(function ReportsListEditor({
  items,
  isLoading,
  isError,
  onRetry,
  onOpen,
  onOpenSample,
}: ReportsListEditorProps) {
  const styles = useStyles();
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View style={styles.root} accessibilityLabel="Loading your reports">
        <SkeletonBlock style={styles.skeleton} />
        <SkeletonBlock style={styles.skeleton} />
        <SkeletonBlock style={styles.skeleton} />
      </View>
    );
  }

  if (isError && items.length === 0) {
    return (
      <View style={styles.root}>
        <EmptyState
          layout="card"
          headline="Couldn't load your reports"
          subtext="Check your connection and try again."
          actionLabel="Retry"
          onAction={onRetry}
        />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.root}>
        <EmptyState
          layout="card"
          headline="Your first Broke Report lands on the 1st"
          subtext="Each month Dime turns your last month into a short story you can share. It needs at least 5 payments in the month."
          actionLabel="See a sample"
          onAction={onOpenSample}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SettingsSection title="Your reports">
        <View style={styles.rows}>
          {items.map((item, index) => (
            <SettingsNavRow
              key={item.period_key}
              icon={Sparkles}
              label={`${monthName(item.month)} ${item.year}`}
              subtitle={paymentsLabel(item.debit_count)}
              accessibilityLabel={`${monthName(item.month)} ${item.year} Broke Report, ${paymentsLabel(item.debit_count)}${item.viewed ? "" : ", new"}`}
              onPress={() => onOpen(item.period_key)}
              trailing={
                <View style={styles.trailing}>
                  {item.viewed ? null : (
                    <View
                      style={[styles.dot, { backgroundColor: colors.accent }]}
                      accessibilityElementsHidden
                    />
                  )}
                  <ChevronRight size={20} color={colors.inkFaint} strokeWidth={2} />
                </View>
              }
              showSeparator={index < items.length - 1}
            />
          ))}
        </View>
      </SettingsSection>

      <SettingsSection title="Preview">
        <View style={styles.rows}>
          <SettingsNavRow
            icon={Sparkles}
            label="See a sample"
            subtitle="A made-up month, to see how a report looks"
            onPress={onOpenSample}
          />
        </View>
      </SettingsSection>

      <Text style={styles.hint}>
        Reports are built on the 1st for the month before. Your roast level is in
        Notifications & alerts.
      </Text>
      {isError ? (
        <Button title="Refresh" variant="ghost" onPress={onRetry} />
      ) : null}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    gap: SETTINGS_SECTION_GAP,
  },
  rows: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  skeleton: {
    height: 64,
    borderRadius: radius.lg,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
}));
