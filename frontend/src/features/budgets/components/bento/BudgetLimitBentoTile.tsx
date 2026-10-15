import { forwardRef, memo } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { BudgetLimitAmountInput } from "./BudgetLimitAmountInput";
import { createThemedStyles } from "@/theme";

type BudgetLimitBentoTileProps = {
  displayAmount: string;
  isCustom: boolean;
  value: string;
  onChangeText: (text: string) => void;
  onAmountPress?: () => void;
  onSubmitEditing?: () => void;
};

const TILE_CONFIG = {
  title: "Monthly cap",
  hint: "Applies to every calendar month",
} as const;

export const BudgetLimitBentoTile = memo(
  forwardRef<TextInput, BudgetLimitBentoTileProps>(
    function BudgetLimitBentoTile(
      {
        displayAmount,
        isCustom,
        value,
        onChangeText,
        onAmountPress,
        onSubmitEditing,
      },
      ref,
    ) {
      const styles = useStyles();
      const config = TILE_CONFIG;

      return (
        <View style={styles.tile}>
          <Text style={styles.title}>{config.title}</Text>

          <Pressable
            style={styles.amountSlot}
            onPress={isCustom ? onAmountPress : undefined}
            disabled={!isCustom}
            accessibilityRole={isCustom ? "button" : undefined}
            accessibilityLabel={
              isCustom ? `Edit ${config.title} limit` : undefined
            }
          >
            {!isCustom ? (
              <Text
                style={styles.presetAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {displayAmount}
              </Text>
            ) : null}

            <View
              pointerEvents={isCustom ? "auto" : "none"}
              style={!isCustom ? styles.inputHidden : undefined}
            >
              <BudgetLimitAmountInput
                ref={ref}
                value={value}
                onChangeText={onChangeText}
                showSoftInputOnFocus={isCustom}
                onSubmitEditing={onSubmitEditing}
              />
            </View>
          </Pressable>

          <Text style={styles.hint} numberOfLines={2}>
            {config.hint}
          </Text>
        </View>
      );
    },
  ),
);

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: "space-between",
    minHeight: 148,
    ...shadows.card,
  },
  title: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: colors.inkSoft,
    marginBottom: spacing.sm,
  },
  amountSlot: {
    minHeight: 44,
    justifyContent: "center",
  },
  presetAmount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 24,
    lineHeight: 30,
    color: colors.ink,
  },
  inputHidden: {
    opacity: 0,
    position: "absolute",
    left: 0,
    right: 0,
    pointerEvents: "none",
  },
  hint: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    lineHeight: 14,
    marginTop: spacing.sm,
    color: colors.inkFaint,
  },
}));
