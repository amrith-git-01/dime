import { forwardRef, memo } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  ink,
  inkFaint,
  inkSoft,
  radius,
  shadows,
  spacing,
  surface,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { BudgetLimitAmountInput } from "./BudgetLimitAmountInput";
import { BUDGET_EDITOR_FLEX } from "./budgetEditorBentoTokens";

export type BudgetLimitTileKind = "daily" | "monthly";

type BudgetLimitBentoTileProps = {
  kind: BudgetLimitTileKind;
  displayAmount: string;
  isCustom: boolean;
  value: string;
  onChangeText: (text: string) => void;
  onAmountPress?: () => void;
  onSubmitEditing?: () => void;
};

const TILE_CONFIG: Record<
  BudgetLimitTileKind,
  { flex: number; title: string; hint: string }
> = {
  daily: {
    flex: BUDGET_EDITOR_FLEX.daily,
    title: "Daily cap",
    hint: "Warns when today exceeds this",
  },
  monthly: {
    flex: BUDGET_EDITOR_FLEX.monthly,
    title: "Monthly cap",
    hint: "Applies to every calendar month",
  },
};

export const BudgetLimitBentoTile = memo(
  forwardRef<TextInput, BudgetLimitBentoTileProps>(
    function BudgetLimitBentoTile(
      {
        kind,
        displayAmount,
        isCustom,
        value,
        onChangeText,
        onAmountPress,
        onSubmitEditing,
      },
      ref,
    ) {
      const config = TILE_CONFIG[kind];

      return (
        <View style={[styles.tile, { flex: config.flex }]}>
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

const styles = StyleSheet.create({
  tile: {
    backgroundColor: surface,
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
    color: inkSoft,
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
    color: ink,
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
    color: inkFaint,
  },
});
