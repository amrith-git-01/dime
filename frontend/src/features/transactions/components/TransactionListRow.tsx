import { memo, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors } from "@/constants/theme";
import type { TransactionRow } from "@/features/transactions/types";

import {
  formatTransactionListAmount,
  hexToRgba,
  mapTransactionRowToUi,
  type TransactionCategory,
  type UiTransaction,
} from "./transactionListShared";

const listColors = {
  surface: "#FFFFFF",
  surfaceTint: "#FAFAFF",
  primaryMuted: "#EEEDFB",
  textPrimary: "#0A0A1F",
  textSecondary: "#6B6B80",
  borderLight: "#EEEEFF",
  success: "#16A34A",
  danger: "#DC2626",
} as const;

type CategoryIconProps = {
  category: TransactionCategory;
};

const CategoryIcon = memo(function CategoryIcon({
  category,
}: CategoryIconProps) {
  return (
    <View
      style={[
        styles.categoryIcon,
        { backgroundColor: hexToRgba(category.color, 0.1) },
      ]}
    >
      <Text style={styles.categoryEmoji}>{category.emoji}</Text>
    </View>
  );
});

type CategoryTagProps = {
  name: string;
  color: string;
};

const CategoryTag = memo(function CategoryTag({
  name,
  color,
}: CategoryTagProps) {
  return (
    <View
      style={[
        styles.categoryTag,
        {
          borderColor: hexToRgba(color, 0.35),
          backgroundColor: hexToRgba(color, 0.12),
        },
      ]}
    >
      <Text style={styles.categoryTagText}>{name}</Text>
    </View>
  );
});

export type TransactionListRowProps = {
  transaction: TransactionRow;
  variant?: "screen" | "card";
  rowIndex?: number;
  animationOrder?: number;
  /** When `variant` is `card`, omit bottom border on last row. */
  showBottomBorder?: boolean;
};

function RowBody({ ui }: { ui: UiTransaction }) {
  return (
    <>
      <CategoryIcon category={ui.category} />

      <View style={styles.transactionBody}>
        <View style={styles.transactionRowLine1}>
          <Text
            style={styles.merchantName}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {ui.merchant}
          </Text>
          <Text
            style={styles.transactionTime}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {ui.timeLabel}
          </Text>
        </View>

        <View style={styles.transactionRowLine2}>
          <View style={styles.tagAndViaRow}>
            <CategoryTag name={ui.category.name} color={ui.category.color} />
            <Text style={styles.tagViaSeparator}>|</Text>
            <Text
              style={styles.transactionVia}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {ui.viaLabel}
            </Text>
          </View>
          <Text
            style={[
              styles.transactionAmount,
              ui.amount > 0 && styles.positiveAmount,
              ui.amount < 0 && styles.debitRowAmount,
            ]}
            numberOfLines={1}
          >
            {formatTransactionListAmount(ui.amount)}
          </Text>
        </View>
      </View>
    </>
  );
}

export const TransactionListRow = memo(function TransactionListRow({
  transaction,
  variant = "screen",
  rowIndex = 0,
  animationOrder = 0,
  showBottomBorder = true,
}: TransactionListRowProps) {
  const ui = useMemo(() => mapTransactionRowToUi(transaction), [transaction]);

  if (variant === "card") {
    const cardRowStyle: StyleProp<ViewStyle> = [
      styles.cardRow,
      !showBottomBorder && styles.cardRowLast,
    ];

    return (
      <View style={cardRowStyle}>
        <RowBody ui={ui} />
      </View>
    );
  }

  return (
    <TransactionListRowScreenAnimated
      ui={ui}
      rowIndex={rowIndex}
      animationOrder={animationOrder}
    />
  );
});

type ScreenAnimatedProps = {
  ui: UiTransaction;
  rowIndex: number;
  animationOrder: number;
};

const TransactionListRowScreenAnimated = memo(
  function TransactionListRowScreenAnimated({
    ui,
    rowIndex,
    animationOrder,
  }: ScreenAnimatedProps) {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(10)).current;
    const scale = useRef(new Animated.Value(1)).current;
    const pressProgress = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          delay: 150 + animationOrder * 40,
          useNativeDriver: false,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          delay: 150 + animationOrder * 40,
          useNativeDriver: false,
        }),
      ]).start();
    }, [animationOrder, opacity, translateY]);

    const rowBackground = pressProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [
        rowIndex % 2 === 0 ? listColors.surface : listColors.surfaceTint,
        listColors.primaryMuted,
      ],
    });

    const animatePressed = (pressed: boolean) => {
      Animated.parallel([
        Animated.timing(pressProgress, {
          toValue: pressed ? 1 : 0,
          duration: 100,
          useNativeDriver: false,
        }),
        Animated.spring(scale, {
          toValue: pressed ? 0.98 : 1,
          useNativeDriver: false,
          speed: 28,
          bounciness: pressed ? 0 : 8,
        }),
      ]).start();
    };

    return (
      <Pressable
        accessibilityRole="button"
        onPressIn={() => animatePressed(true)}
        onPressOut={() => animatePressed(false)}
      >
        <Animated.View
          style={[
            styles.screenRow,
            {
              backgroundColor: rowBackground,
              opacity,
              transform: [{ translateY }, { scale }],
            },
          ]}
        >
          <RowBody ui={ui} />
        </Animated.View>
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  screenRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cardRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  cardRowLast: {
    borderBottomWidth: 0,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  categoryEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  transactionBody: {
    flex: 1,
    minWidth: 0,
  },
  transactionRowLine1: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  transactionRowLine2: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  tagAndViaRow: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    minWidth: 0,
    gap: 3,
  },
  categoryTag: {
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 0,
    maxWidth: "100%",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryTagText: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 13,
    color: listColors.textPrimary,
  },
  tagViaSeparator: {
    flexShrink: 0,
    paddingHorizontal: 2,
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 14,
    color: listColors.textSecondary,
  },
  merchantName: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 20,
    color: listColors.textPrimary,
  },
  transactionTime: {
    flexShrink: 0,
    maxWidth: "42%",
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: listColors.textSecondary,
    textAlign: "right",
  },
  transactionVia: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 14,
    color: listColors.textSecondary,
  },
  transactionAmount: {
    minWidth: 88,
    flexShrink: 0,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 16,
    lineHeight: 20,
    color: listColors.textPrimary,
    textAlign: "right",
  },
  positiveAmount: {
    color: listColors.success,
  },
  debitRowAmount: {
    color: listColors.danger,
  },
});
