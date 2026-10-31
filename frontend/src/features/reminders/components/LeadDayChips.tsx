import { memo } from "react";
import { View } from "react-native";

import { SegmentChip } from "@/components/ui";
import { spacing } from "@/constants";
import { createThemedStyles } from "@/theme";

import { MAX_LEAD_DAY_ENTRIES } from "../constants";

export type LeadDayChipsProps = {
  /** Day counts to offer, in display order. */
  options: readonly number[];
  selected: readonly number[];
  onToggle: (day: number) => void;
  /** Options above this are dimmed and cannot be picked (the repeat's longest lead). */
  cap?: number;
  maxEntries?: number;
  disabled?: boolean;
};

/** "On the day", "1 day", "3 days". The caption next to the chips says "before the due date". */
export function leadDayLabel(day: number): string {
  if (day === 0) {
    return "On the day";
  }
  return day === 1 ? "1 day" : `${day} days`;
}

/** Spoken label of one chip: "3 days before", "On the due date". */
export function leadDayAccessibilityLabel(day: number): string {
  if (day === 0) {
    return "On the due date";
  }
  return day === 1 ? "1 day before" : `${day} days before`;
}

/** Multi-select chips of "how many days before" (reminders, recurring items, settings defaults). */
export const LeadDayChips = memo(function LeadDayChips({
  options,
  selected,
  onToggle,
  cap = Number.POSITIVE_INFINITY,
  maxEntries = MAX_LEAD_DAY_ENTRIES,
  disabled = false,
}: LeadDayChipsProps) {
  const styles = useStyles();
  const full = selected.length >= maxEntries;
  return (
    <View style={styles.grid}>
      {options.map((day) => {
        const isSelected = selected.includes(day);
        const blocked = disabled || day > cap || (full && !isSelected);
        return (
          <View key={day} style={styles.cell}>
            <SegmentChip
              label={leadDayLabel(day)}
              accessibilityLabel={leadDayAccessibilityLabel(day)}
              selected={isSelected}
              disabled={blocked}
              onPress={() => onToggle(day)}
            />
          </View>
        );
      })}
    </View>
  );
});

const useStyles = createThemedStyles(() => ({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  cell: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 92,
  },
}));
