import { forwardRef, memo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { bento, colors, radius, spacing } from "@/constants/theme";

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
  {
    flex: number;
    backgroundColor: string;
    variant: "onDark" | "onPastel";
    title: string;
    hint: string;
    shadowStyle: object | undefined;
  }
> = {
  daily: {
    flex: BUDGET_EDITOR_FLEX.daily,
    backgroundColor: colors.headerGradientStart,
    variant: "onDark",
    title: "Daily cap",
    hint: "Warns when today exceeds this",
    shadowStyle: Platform.select({
      android: { elevation: 5 },
      default: {
        shadowColor: colors.headerGradientStart,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.28,
        shadowRadius: 14,
      },
    }),
  },
  monthly: {
    flex: BUDGET_EDITOR_FLEX.monthly,
    backgroundColor: bento.monthSpendSurface,
    variant: "onPastel",
    title: "Monthly cap",
    hint: "Applies to every calendar month",
    shadowStyle: Platform.select({
      android: { elevation: 3 },
      default: {
        shadowColor: colors.brandPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
    }),
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
      const labelColor =
        config.variant === "onDark"
          ? bento.onSurface.muted
          : bento.onPastel.muted;
      const hintColor =
        config.variant === "onDark"
          ? bento.onSurface.secondary
          : bento.onPastel.secondary;
      const amountColor =
        config.variant === "onDark"
          ? bento.onSurface.primary
          : bento.onPastel.primary;

      return (
        <View
          style={[
            styles.tile,
            { flex: config.flex, backgroundColor: config.backgroundColor },
            config.shadowStyle,
          ]}
        >
          <Text style={[styles.title, { color: labelColor }]}>
            {config.title}
          </Text>

          <Pressable
            style={styles.amountSlot}
            onPress={isCustom ? onAmountPress : undefined}
            disabled={!isCustom}
          >
            {!isCustom ? (
              <Text
                style={[styles.presetAmount, { color: amountColor }]}
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
                variant={config.variant}
                showSoftInputOnFocus={isCustom}
                onSubmitEditing={onSubmitEditing}
              />
            </View>
          </Pressable>

          <Text style={[styles.hint, { color: hintColor }]} numberOfLines={2}>
            {config.hint}
          </Text>
        </View>
      );
    },
  ),
);

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.lg,
    padding: spacing.md,
    justifyContent: "space-between",
    minHeight: 148,
  },
  title: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.6,
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
  },
});
