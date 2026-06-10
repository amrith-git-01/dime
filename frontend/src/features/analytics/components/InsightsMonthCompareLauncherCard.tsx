import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { View as ViewRef } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import {
  BENTO_MONTH_DROPDOWN_VISIBLE,
  useBentoMonthDropdown,
} from "@/components/bento";
import { BentoActionPill, TwoToneCard } from "@/components/shared";
import { SelectDropdown } from "@/components/ui";
import { bento, colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import {
  areCompareMonthsEqual,
  defaultCompareMonthBIndex,
  monthOptionToCompareParam,
  type CompareMonthParam,
} from "@/features/analytics/utils/compareMonths";
import type { MonthOption } from "@/utils/buildMonthOptions";

export type InsightsMonthCompareLauncherCardProps = {
  monthOptions: MonthOption[];
  insightsSelectedMonthIndex: number;
  onCompare: (monthA: CompareMonthParam, monthB: CompareMonthParam) => void;
};

export const InsightsMonthCompareLauncherCard = memo(
  function InsightsMonthCompareLauncherCard({
    monthOptions,
    insightsSelectedMonthIndex,
    onCompare,
  }: InsightsMonthCompareLauncherCardProps) {
    const [monthAIndex, setMonthAIndex] = useState(insightsSelectedMonthIndex);
    const [monthBIndex, setMonthBIndex] = useState(() =>
      defaultCompareMonthBIndex(monthOptions, insightsSelectedMonthIndex),
    );

    useEffect(() => {
      setMonthAIndex(insightsSelectedMonthIndex);
      setMonthBIndex(
        defaultCompareMonthBIndex(monthOptions, insightsSelectedMonthIndex),
      );
    }, [insightsSelectedMonthIndex, monthOptions]);

    const monthA = monthOptions[monthAIndex] ?? monthOptions[0];
    const monthB = monthOptions[monthBIndex] ?? monthOptions[0];

    const compareDisabled = useMemo(() => {
      if (!monthA || !monthB) {
        return true;
      }
      return areCompareMonthsEqual(
        monthOptionToCompareParam(monthA),
        monthOptionToCompareParam(monthB),
      );
    }, [monthA, monthB]);

    const handleCompare = useCallback(() => {
      if (!monthA || !monthB || compareDisabled) {
        return;
      }
      onCompare(
        monthOptionToCompareParam(monthA),
        monthOptionToCompareParam(monthB),
      );
    }, [compareDisabled, monthA, monthB, onCompare]);

    const {
      dropdownOptions: monthADropdownOptions,
      handleMonthChange: handleMonthAChange,
    } = useBentoMonthDropdown(monthOptions, setMonthAIndex);
    const {
      dropdownOptions: monthBDropdownOptions,
      handleMonthChange: handleMonthBChange,
    } = useBentoMonthDropdown(monthOptions, setMonthBIndex);

    const monthAAnchorRef = useRef<ViewRef>(null);
    const monthBAnchorRef = useRef<ViewRef>(null);

    return (
      <TwoToneCard
        header={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Compare months</Text>
            <Text style={styles.headerSubtitle}>
              See how two months stack up
            </Text>
          </View>
        }
        body={
          <View style={styles.body}>
            <View style={styles.pickerRow}>
              <View
                ref={monthAAnchorRef}
                style={styles.dropdownWrap}
                collapsable={false}
              >
                <SelectDropdown
                  options={monthADropdownOptions}
                  value={monthA?.label ?? ""}
                  onChange={handleMonthAChange}
                  placeholder="Month A"
                  showLabel={false}
                  size="compact"
                  menuPlacement="modal"
                  menuOpenDirection="below"
                  maxVisibleOptions={BENTO_MONTH_DROPDOWN_VISIBLE}
                  panelAnchorRef={monthAAnchorRef}
                />
              </View>

              <Text style={styles.vsLabel}>vs</Text>

              <View
                ref={monthBAnchorRef}
                style={styles.dropdownWrap}
                collapsable={false}
              >
                <SelectDropdown
                  options={monthBDropdownOptions}
                  value={monthB?.label ?? ""}
                  onChange={handleMonthBChange}
                  placeholder="Month B"
                  showLabel={false}
                  size="compact"
                  menuPlacement="modal"
                  menuOpenDirection="below"
                  maxVisibleOptions={BENTO_MONTH_DROPDOWN_VISIBLE}
                  panelAnchorRef={monthBAnchorRef}
                />
              </View>
            </View>

            <BentoActionPill
              label="Compare"
              onPress={handleCompare}
              disabled={compareDisabled}
              fullWidth
            />
          </View>
        }
      />
    );
  },
);

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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dropdownWrap: {
    flex: 1,
    minWidth: 0,
  },
  vsLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: bento.onPastel.muted,
    flexShrink: 0,
  },
});
