import { format, getDay, getDaysInMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { memo, useCallback, useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { SkeletonBlock } from "@/components/ui";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { tourTargetIds } from "@/constants/tourTargetIds";
import { useTourTarget } from "@/hooks/useTourTarget";
import {
  computeMonthSpendIntensities,
  type SpendIntensity,
} from "@/features/transactions/utils/computeMonthSpendIntensities";
import { formatInrCompact } from "@/utils/currency";
import { createThemedStyles, useTheme } from "@/theme";

// Week starts on Monday for Indian locale
const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

/** Convert date-fns `getDay()` (0=Sun) to Monday-first column index (0=Mon). */
function toMondayFirst(sundayFirst: number): number {
  return (sundayFirst + 6) % 7;
}

export type TransactionCalendarCardProps = {
  year: number;
  monthIndex0: number;
  /** dayKey (yyyy-MM-dd) → total debit spend for that day */
  spendByDay: Record<string, number>;
  /** Days (yyyy-MM-dd) with a recurring occurrence still to come: they get a small dot. */
  upcomingDayKeys?: ReadonlySet<string>;
  /** Recurring spend still to come this month (rupees); a caption shows when above 0. */
  upcomingTotal?: number;
  selectedDayKey: string;
  onSelectDay: (dayKey: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  isLoading?: boolean;
};

export const TransactionCalendarCard = memo(function TransactionCalendarCard({
  year,
  monthIndex0,
  spendByDay,
  upcomingDayKeys,
  upcomingTotal = 0,
  selectedDayKey,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  canGoPrevMonth,
  canGoNextMonth,
  isLoading = false,
}: TransactionCalendarCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const calendarTourTarget = useTourTarget(tourTargetIds.transactionsCalendar);
  const monthNavTourTarget = useTourTarget(tourTargetIds.transactionsMonthNav);
  const monthLabel = format(new Date(year, monthIndex0, 1), "MMMM yyyy");
  const daysInMonth = getDaysInMonth(new Date(year, monthIndex0, 1));
  const firstDayCol = toMondayFirst(getDay(new Date(year, monthIndex0, 1)));
  const todayKey = format(new Date(), "yyyy-MM-dd");

  const intensityByDay = useMemo(
    () => computeMonthSpendIntensities(spendByDay, year, monthIndex0),
    [monthIndex0, spendByDay, year],
  );

  const cells = Array.from(
    { length: Math.ceil((firstDayCol + daysInMonth) / 7) * 7 },
    (_, i) => {
      const dayNum = i - firstDayCol + 1;
      return dayNum >= 1 && dayNum <= daysInMonth ? dayNum : null;
    },
  );

  const handleDayPress = useCallback(
    (dayNum: number) => {
      const paddedMonth = String(monthIndex0 + 1).padStart(2, "0");
      const paddedDay = String(dayNum).padStart(2, "0");
      onSelectDay(`${year}-${paddedMonth}-${paddedDay}`);
    },
    [year, monthIndex0, onSelectDay],
  );

  return (
    <View {...calendarTourTarget} style={styles.cardShadow}>
      <View style={styles.card}>
        {/* Month navigation header */}
        <View {...monthNavTourTarget} style={styles.monthNav}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            accessibilityState={{ disabled: !canGoPrevMonth }}
            disabled={!canGoPrevMonth}
            hitSlop={12}
            onPress={onPrevMonth}
            style={({ pressed }) => [
              styles.navBtn,
              !canGoPrevMonth && styles.navBtnDisabled,
              pressed && styles.navBtnPressed,
            ]}
          >
            <ChevronLeft
              size={20}
              color={canGoPrevMonth ? colors.ink : colors.inkFaint}
              strokeWidth={1.5}
            />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: !canGoNextMonth }}
            disabled={!canGoNextMonth}
            hitSlop={12}
            onPress={onNextMonth}
            style={({ pressed }) => [
              styles.navBtn,
              !canGoNextMonth && styles.navBtnDisabled,
              pressed && styles.navBtnPressed,
            ]}
          >
            <ChevronRight
              size={20}
              color={canGoNextMonth ? colors.ink : colors.inkFaint}
              strokeWidth={1.5}
            />
          </Pressable>
        </View>

        {upcomingTotal > 0 && !isLoading ? (
          <Text style={styles.upcomingCaption}>
            {`Upcoming ${formatInrCompact(upcomingTotal)} this month`}
          </Text>
        ) : null}

        {/* Weekday labels */}
        <View style={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((label, i) => (
            <View key={i} style={styles.cell}>
              <Text style={styles.weekdayLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Day grid */}
        {isLoading ? (
          <View style={styles.skeletonGrid}>
            {Array.from({ length: 5 }, (_, row) => (
              <View key={row} style={styles.weekRow}>
                {Array.from({ length: 7 }, (_, col) => (
                  <View key={col} style={styles.cell}>
                    <SkeletonBlock style={styles.skeletonCell} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : (
          <View>
            {Array.from(
              { length: Math.ceil(cells.length / 7) },
              (_, rowIdx) => (
                <View key={rowIdx} style={styles.weekRow}>
                  {cells
                    .slice(rowIdx * 7, rowIdx * 7 + 7)
                    .map((dayNum, colIdx) => {
                      if (dayNum === null) {
                        return <View key={colIdx} style={styles.cell} />;
                      }
                      const paddedMonth = String(monthIndex0 + 1).padStart(
                        2,
                        "0",
                      );
                      const paddedDay = String(dayNum).padStart(2, "0");
                      const dayKey = `${year}-${paddedMonth}-${paddedDay}`;
                      const isSelected = dayKey === selectedDayKey;
                      const isTodayCell = dayKey === todayKey && !isSelected;
                      const spend = spendByDay[dayKey] ?? 0;
                      const intensity: SpendIntensity =
                        spend > 0 ? (intensityByDay[dayKey] ?? "low") : "none";

                      return (
                        <DayCell
                          key={dayKey}
                          dayNum={dayNum}
                          isSelected={isSelected}
                          isToday={isTodayCell}
                          intensity={intensity}
                          hasUpcoming={upcomingDayKeys?.has(dayKey) ?? false}
                          onPress={handleDayPress}
                        />
                      );
                    })}
                </View>
              ),
            )}
          </View>
        )}

        {!isLoading ? <HeatmapLegend /> : null}
      </View>
    </View>
  );
});

function HeatmapLegend() {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.legendRow}>
      <View style={styles.legendScale}>
        <Text style={styles.legendHint}>Less</Text>
        <View style={[styles.legendDot, { backgroundColor: colors.accentHeat1 }]} />
        <View style={[styles.legendDot, { backgroundColor: colors.accentHeat2 }]} />
        <View style={[styles.legendDot, { backgroundColor: colors.accentHeat3 }]} />
        <Text style={styles.legendHint}>More</Text>
      </View>
    </View>
  );
}

type DayCellProps = {
  dayNum: number;
  isSelected: boolean;
  isToday: boolean;
  intensity: SpendIntensity;
  /** A recurring occurrence is still to come on this day. */
  hasUpcoming: boolean;
  onPress: (dayNum: number) => void;
};

function DayCell({
  dayNum,
  isSelected,
  isToday,
  intensity,
  hasUpcoming,
  onPress,
}: DayCellProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const handlePress = useCallback(() => onPress(dayNum), [dayNum, onPress]);

  const showTodayRing = isToday && !isSelected;

  const circleBg = isSelected
    ? colors.accent
    : intensity === "high"
      ? colors.accentHeat3
      : intensity === "medium"
        ? colors.accentHeat2
        : intensity === "low"
          ? colors.accentHeat1
          : "transparent";

  const textColor = isSelected
    ? colors.onAccent
    : intensity === "high"
      ? colors.onAccent
      : showTodayRing
        ? colors.accentText
        : intensity === "none"
          ? colors.inkFaint
          : colors.ink;

  const fontWeight = isSelected ? ("700" as const) : ("400" as const);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={handlePress}
      android_ripple={
        Platform.OS === "android"
          ? {
              color: colors.accentHeat1,
              borderless: true,
              radius: DAY_CHIP_RADIUS,
            }
          : undefined
      }
      style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
    >
      <View
        collapsable={false}
        style={[
          styles.dayCircle,
          {
            backgroundColor: circleBg,
            borderWidth: showTodayRing ? 1.5 : 0,
            borderColor: showTodayRing ? colors.accent : "transparent",
          },
        ]}
      >
        <Text
          key={isSelected ? "selected" : "default"}
          style={[styles.dayNum, { color: textColor, fontWeight }]}
        >
          {dayNum}
        </Text>
        {hasUpcoming ? (
          <View
            style={[
              styles.upcomingDot,
              {
                backgroundColor:
                  isSelected || intensity === "high"
                    ? colors.onAccent
                    : colors.inkSoft,
              },
            ]}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const CELL_SIZE = 40;
const DAY_CHIP_SIZE = CELL_SIZE - 4;
/** Half-size radius — reliable circles on Android (9999 breaks under card elevation). */
const DAY_CHIP_RADIUS = DAY_CHIP_SIZE / 2;

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  cardShadow: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    ...shadows.card,
  },
  card: {
    borderRadius: radius.xl,
    overflow: "hidden",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  // Month navigation
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  monthLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
    textAlign: "center",
    flex: 1,
  },
  navBtn: {
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navBtnPressed: {
    opacity: 0.65,
  },
  upcomingCaption: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    textAlign: "center",
    marginBottom: spacing.sm,
    fontVariant: ["tabular-nums"],
  },
  upcomingDot: {
    position: "absolute",
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  // Weekday row
  weekdayRow: {
    flexDirection: "row",
    marginBottom: spacing.xs,
  },
  weekRow: {
    flexDirection: "row",
  },
  cell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: CELL_SIZE,
  },
  cellPressed: {
    opacity: 0.7,
  },
  weekdayLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.3,
    color: colors.inkFaint,
    textTransform: "uppercase",
    textAlign: "center",
  },
  dayCircle: {
    width: DAY_CHIP_SIZE,
    height: DAY_CHIP_SIZE,
    borderRadius: DAY_CHIP_RADIUS,
    overflow: "hidden",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  dayNum: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginHorizontal: -spacing.lg,
    marginTop: spacing.md,
  },
  // Skeleton
  skeletonGrid: {
    gap: 2,
  },
  skeletonCell: {
    width: DAY_CHIP_SIZE - 4,
    height: DAY_CHIP_SIZE - 4,
    borderRadius: (DAY_CHIP_SIZE - 4) / 2,
    alignSelf: "center",
    overflow: "hidden",
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.xs,
  },
  legendScale: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    lineHeight: 13,
    color: colors.inkFaint,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
}));
