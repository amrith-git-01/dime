import { useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import {
  accent,
  danger,
  fontFamilies,
  inkFaint,
  inkSoft,
  line,
  radius,
  shadow,
  spacing,
  success,
  surface,
} from "@/constants";
import type { TransactionType } from "@/features/transactions/types";
import { AppTextInput } from "@/components/ui";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

type ManualAddAmountSectionProps = {
  amountText: string;
  amountFocused: boolean;
  onAmountChange: (text: string) => void;
  onAmountFocus: () => void;
  onAmountBlur: () => void;
  txType: TransactionType;
  onSetExpense: () => void;
  onSetIncome: () => void;
  /**
   * Show the Expense / Income switch (default). Hide it where the type is fixed by the screen
   * (recurring income / subscriptions): `txType` then only picks the amount colour.
   */
  showTypeToggle?: boolean;
};

const TRACK_HEIGHT = 44;
const PILL_INSET = 3;

const pillShadow = Platform.select({
  android: { elevation: 2 } as const,
  default: {
    shadowColor: shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  } as const,
});

export function ManualAddAmountSection({
  amountText,
  onAmountChange,
  onAmountFocus,
  onAmountBlur,
  txType,
  onSetExpense,
  onSetIncome,
  showTypeToggle = true,
}: ManualAddAmountSectionProps) {
  const translateX = useSharedValue(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const tabWidth = trackWidth / 2;
  const selectedIndex = txType === "debit" ? 0 : 1;

  useEffect(() => {
    if (trackWidth > 0) {
      translateX.value = withSpring(selectedIndex * tabWidth, {
        damping: 18,
        stiffness: 220,
        mass: 0.9,
      });
    }
  }, [selectedIndex, tabWidth, translateX, trackWidth]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handleExpensePress = () => {
    if (txType === "debit") return;
    void triggerHaptic();
    onSetExpense();
  };

  const handleIncomePress = () => {
    if (txType === "credit") return;
    void triggerHaptic();
    onSetIncome();
  };

  const hasValue = amountText !== "" && amountText !== "0";
  const amountColor = hasValue
    ? txType === "debit"
      ? danger
      : success
    : inkFaint;

  return (
    <View style={styles.container}>
      <Text style={styles.amountKicker}>AMOUNT</Text>

      <View style={styles.amountRow}>
        <Text style={[styles.currencyPrefix, { color: amountColor }]}>
          {"\u20b9"}
        </Text>
        <AppTextInput
          containerStyle={styles.amountInputSlot}
          style={[styles.amountInput, { color: amountColor }]}
          placeholder="0"
          placeholderTextColor={inkFaint}
          keyboardType="decimal-pad"
          value={amountText}
          onChangeText={onAmountChange}
          onFocus={onAmountFocus}
          onBlur={onAmountBlur}
          underlineColorAndroid="transparent"
        />
      </View>

      {showTypeToggle ? (
        <View
          style={styles.track}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          {trackWidth > 0 ? (
            <Animated.View
              style={[
                styles.pill,
                { width: tabWidth - PILL_INSET * 2 },
                pillStyle,
              ]}
              pointerEvents="none"
            />
          ) : null}
          <Pressable
            style={styles.tab}
            onPress={handleExpensePress}
            accessibilityRole="tab"
            accessibilityState={{ selected: txType === "debit" }}
          >
            <Text
              style={[
                styles.tabLabel,
                txType === "debit"
                  ? styles.expenseSelected
                  : styles.labelUnselected,
              ]}
            >
              Expense
            </Text>
          </Pressable>
          <Pressable
            style={styles.tab}
            onPress={handleIncomePress}
            accessibilityRole="tab"
            accessibilityState={{ selected: txType === "credit" }}
          >
            <Text
              style={[
                styles.tabLabel,
                txType === "credit"
                  ? styles.incomeSelected
                  : styles.labelUnselected,
              ]}
            >
              Income
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  amountKicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    color: accent,
    textTransform: "uppercase",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  currencyPrefix: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 42,
    fontVariant: ["tabular-nums"],
    ...Platform.select({
      android: { lineHeight: 50, includeFontPadding: false },
      default: { lineHeight: 50 },
    }),
  },
  amountInputSlot: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  amountInput: {
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 42,
    fontVariant: ["tabular-nums"],
    padding: 0,
    margin: 0,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        textAlignVertical: "center",
        height: "100%",
        paddingVertical: 0,
      },
    }),
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.full,
    backgroundColor: line,
    flexDirection: "row",
    position: "relative",
    overflow: "hidden",
  },
  pill: {
    position: "absolute",
    top: PILL_INSET,
    left: PILL_INSET,
    bottom: PILL_INSET,
    borderRadius: radius.full,
    backgroundColor: surface,
    ...pillShadow,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 14,
    lineHeight: 18,
  },
  expenseSelected: {
    fontFamily: fontFamilies.semiBold,
    color: danger,
  },
  incomeSelected: {
    fontFamily: fontFamilies.semiBold,
    color: success,
  },
  labelUnselected: {
    fontFamily: fontFamilies.regular,
    color: inkSoft,
  },
});
