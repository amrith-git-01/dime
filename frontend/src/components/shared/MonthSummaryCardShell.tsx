import { memo, useRef, type ReactNode } from "react";
import type { View as ViewRef } from "react-native";
import { Text, View } from "react-native";

import {
  BENTO_MONTH_DROPDOWN_VISIBLE,
  useBentoMonthDropdown,
} from "@/components/bento";
import { SelectDropdown } from "@/components/ui";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { MonthOption } from "@/utils/buildMonthOptions";

import { TwoToneCard } from "./TwoToneCard";
import { createThemedStyles } from "@/theme";

export type MonthSummaryCardShellProps = {
  selectedMonth: string;
  monthOptions: MonthOption[];
  onSelectMonth: (index: number) => void;
  /** Fired when the month picker menu opens or closes (used to pause list scroll). */
  onMonthMenuOpenChange?: (open: boolean) => void;
  headerContent: ReactNode;
  headerActions?: ReactNode;
  /** Full-width row in the header tone (e.g. day-range pager). */
  headerBelow?: ReactNode;
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
  headerBelow,
  bodyKicker,
  children,
}: MonthSummaryCardShellProps) {
  const styles = useStyles();
  const dropdownAnchorRef = useRef<ViewRef>(null);
  const { dropdownOptions, handleMonthChange } = useBentoMonthDropdown(
    monthOptions,
    onSelectMonth,
  );

  return (
    <TwoToneCard
      header={
        <View>
          <View style={styles.headerInner}>
            <View style={styles.headerLeft}>{headerContent}</View>

            <View style={styles.headerRight}>
              {headerActions}
              <View
                ref={dropdownAnchorRef}
                style={styles.dropdownWrap}
                collapsable={false}
              >
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
                  panelAnchorRef={dropdownAnchorRef}
                />
              </View>
            </View>
          </View>
          {headerBelow ? (
            <View style={styles.headerBelow}>{headerBelow}</View>
          ) : null}
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
  const styles = useStyles();
  return <Text style={styles.activityKicker}>{children}</Text>;
}

export function MonthSummaryHeaderTitle({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.headerTitle}>{children}</Text>;
}

export function MonthSummaryHeaderError({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.errorText}>{children}</Text>;
}

export function MonthSummaryUnavailableText() {
  const styles = useStyles();
  return <Text style={styles.unavailable}>{"\u2014"}</Text>;
}

export function MonthSummaryStatsRow({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.statsRow}>{children}</View>;
}

export function MonthSummaryStatDivider() {
  const styles = useStyles();
  return <View style={styles.divider} />;
}

export function MonthSummarySectionDivider() {
  const styles = useStyles();
  return <View style={styles.sectionDivider} />;
}

const useStyles = createThemedStyles(({ colors }) => ({
  headerInner: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerBelow: {
    paddingHorizontal: spacing.lg,
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
    color: colors.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerTitle: {
    marginTop: 4,
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.accentText,
  },
  errorText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  bodyInner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bodyKicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    color: colors.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.45,
    marginBottom: spacing.sm,
  },
  unavailable: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.inkFaint,
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
    backgroundColor: colors.surfaces.primaryBorder28,
    marginHorizontal: spacing.xs,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.surfaces.primaryBorder28,
  },
}));
