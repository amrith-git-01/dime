import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  BENTO_MONTH_DROPDOWN_VISIBLE,
  useBentoMonthDropdown,
} from "@/components/bento";
import { SelectDropdown } from "@/components/ui";
import { bento, colors, spacing, surfaces } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { MonthOption } from "@/utils/buildMonthOptions";

import { TwoToneCard } from "./TwoToneCard";

export type MonthSummaryCardShellProps = {
  selectedMonth: string;
  monthOptions: MonthOption[];
  onSelectMonth: (index: number) => void;
  /** Fired when the month picker menu opens or closes (used to pause list scroll). */
  onMonthMenuOpenChange?: (open: boolean) => void;
  headerContent: ReactNode;
  headerActions?: ReactNode;
  bodyKicker: string;
  children: ReactNode;
};

export const MonthSummaryCardShell = memo(function MonthSummaryCardShell({
  selectedMonth,
  monthOptions,
  onSelectMonth,
  onMonthMenuOpenChange,
  headerContent,
  headerActions,
  bodyKicker,
  children,
}: MonthSummaryCardShellProps) {
  const { dropdownOptions, handleMonthChange } = useBentoMonthDropdown(
    monthOptions,
    onSelectMonth,
  );

  return (
    <TwoToneCard
      header={
        <View style={styles.headerInner}>
          <View style={styles.headerLeft}>{headerContent}</View>

          <View style={styles.headerRight}>
            {headerActions}
            <View style={styles.dropdownWrap} collapsable={false}>
              <SelectDropdown
                options={dropdownOptions}
                value={selectedMonth}
                onChange={handleMonthChange}
                placeholder="Select month"
                showLabel={false}
                size="compact"
                menuPlacement="modal"
                menuOpenDirection="below"
                maxVisibleOptions={BENTO_MONTH_DROPDOWN_VISIBLE}
                onOpenChange={onMonthMenuOpenChange}
              />
            </View>
          </View>
        </View>
      }
      body={
        <View style={styles.bodyInner}>
          <Text style={styles.bodyKicker}>{bodyKicker}</Text>
          {children}
        </View>
      }
    />
  );
});

export function MonthSummaryHeaderKicker({
  children,
}: {
  children: ReactNode;
}) {
  return <Text style={styles.activityKicker}>{children}</Text>;
}

export function MonthSummaryHeaderTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.headerTitle}>{children}</Text>;
}

export function MonthSummaryHeaderError({ children }: { children: ReactNode }) {
  return <Text style={styles.errorText}>{children}</Text>;
}

export function MonthSummaryUnavailableText() {
  return <Text style={styles.unavailable}>{"\u2014"}</Text>;
}

export function MonthSummaryStatsRow({ children }: { children: ReactNode }) {
  return <View style={styles.statsRow}>{children}</View>;
}

export function MonthSummaryStatDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  headerInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    justifyContent: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 0,
  },
  dropdownWrap: {
    flexShrink: 0,
    alignSelf: "flex-start",
    zIndex: 1,
  },
  activityKicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerTitle: {
    marginTop: 4,
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.primary,
  },
  errorText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: bento.onPastel.primary,
  },
  bodyInner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bodyKicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.45,
    marginBottom: spacing.sm,
  },
  unavailable: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 15,
    lineHeight: 21,
    color: bento.onPastel.muted,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    minHeight: 36,
    backgroundColor: surfaces.primaryBorder28,
    marginHorizontal: spacing.xs,
  },
});
