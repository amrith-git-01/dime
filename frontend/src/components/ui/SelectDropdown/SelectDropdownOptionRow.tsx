import { Check } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text } from "react-native";

import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import {
  COMPACT_OPTION_ROW_HEIGHT,
  type SelectDropdownSize,
  type SelectDropdownVariant,
} from "./selectDropdownLayout";
import { createThemedStyles, useTheme } from "@/theme";

type SelectDropdownOptionRowProps = {
  value: string;
  label: string;
  selected: boolean;
  isLast: boolean;
  size: SelectDropdownSize;
  variant: SelectDropdownVariant;
  onSelect: (value: string) => void;
};

export const SelectDropdownOptionRow = memo(function SelectDropdownOptionRow({
  value,
  label,
  selected,
  isLast,
  size,
  variant,
  onSelect,
}: SelectDropdownOptionRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onSelect(value)}
      style={({ pressed }) => [
        styles.optionRow,
        size === "compact" && styles.optionRowCompact,
        variant === "primary" && styles.optionRowPrimary,
        variant === "secondary" && styles.optionRowSecondary,
        !isLast && styles.optionRowBorder,
        selected && styles.optionRowSelected,
        pressed && styles.optionRowPressed,
      ]}
    >
      <Text
        style={[
          styles.optionLabel,
          size === "compact" && styles.optionLabelCompact,
          variant === "primary" && styles.optionLabelPrimary,
          variant === "secondary" && styles.optionLabelSecondary,
          selected && styles.optionLabelSelected,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {selected ? (
        <Check
          size={size === "compact" ? 14 : 18}
          color={colors.accentText}
          strokeWidth={2}
        />
      ) : null}
    </Pressable>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  optionRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  optionRowPrimary: {
    minHeight: 40,
  },
  optionRowSecondary: {
    minHeight: 32,
    paddingHorizontal: 10,
  },
  optionRowCompact: {
    minHeight: COMPACT_OPTION_ROW_HEIGHT,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  optionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  optionRowSelected: {
    backgroundColor: colors.surfaces.selectHighlight,
  },
  optionRowPressed: {
    opacity: 0.9,
  },
  optionLabel: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    marginRight: spacing.sm,
  },
  optionLabelPrimary: {
    fontSize: 14,
    lineHeight: 18,
  },
  optionLabelSecondary: {
    fontSize: 11,
    lineHeight: 14,
    marginRight: 4,
  },
  optionLabelCompact: {
    fontSize: 12,
    lineHeight: 16,
    marginRight: spacing.xs,
  },
  optionLabelSelected: {
    fontFamily: fontFamilies.medium,
  },
}));
