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
  isVisible?: boolean;
  /**
   * When `variant` is `screen`, enables staggered entrance tied to visibility (heavy while scrolling).
   * Default `true` for home feed; set `false` on Transactions screen.
   */
  enableScrollAnimations?: boolean;
  /** When `variant` is `card`, omit bottom border on last row. */
  showBottomBorder?: boolean;
  onPress?: (tx: TransactionRow) => void;
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
  isVisible = true,
  enableScrollAnimations = true,
  showBottomBorder = true,
  onPress,
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

  if (!enableScrollAnimations) {
    return (
      <TransactionListRowScreenStatic
        ui={ui}
        rowIndex={rowIndex}
        transaction={transaction}
        onPress={onPress}
      />
    );
  }

  return (
    <TransactionListRowScreenAnimated
      ui={ui}
      rowIndex={rowIndex}
      animationOrder={animationOrder}
      transaction={transaction}
      isVisible={isVisible}
      onPress={onPress}
    />
  );
});

type ScreenAnimatedProps = {
  ui: UiTransaction;
  rowIndex: number;
  animationOrder: number;
  transaction?: TransactionRow;
  onPress?: (tx: TransactionRow) => void;
  isVisible?: boolean;
};

type ScreenStaticProps = {
  ui: UiTransaction;
  rowIndex: number;
  transaction: TransactionRow;
  onPress?: (tx: TransactionRow) => void;
};

const TransactionListRowScreenStatic = memo(
  function TransactionListRowScreenStatic({
    ui,
    rowIndex,
    transaction,
    onPress,
  }: ScreenStaticProps) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onPress?.(transaction);
        }}
        style={({ pressed }) => [
          styles.screenRow,
          rowIndex % 2 === 0 ? styles.screenRowEven : styles.screenRowOdd,
          pressed && styles.screenRowPressed,
        ]}
      >
        <RowBody ui={ui} />
      </Pressable>
    );
  },
);

const TransactionListRowScreenAnimated = memo(
  function TransactionListRowScreenAnimated({
    ui,
    rowIndex,
    animationOrder,
    transaction,
    onPress,
    isVisible = true,
  }: ScreenAnimatedProps) {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(14)).current;
    const scale = useRef(new Animated.Value(1)).current;
    const pressProgress = useRef(new Animated.Value(0)).current;
    const hasAnimatedIn = useRef(false);

    useEffect(() => {
      if (!isVisible || hasAnimatedIn.current) {
        return;
      }

      hasAnimatedIn.current = true;
      opacity.setValue(0);
      translateY.setValue(10);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 120,
          delay: Math.min(animationOrder * 16, 64),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 120,
          delay: Math.min(animationOrder * 16, 64),
          useNativeDriver: true,
        }),
      ]).start();
    }, [animationOrder, isVisible, opacity, translateY]);

    const pressOverlayOpacity = pressProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });

    const animatePressed = (pressed: boolean) => {
      Animated.parallel([
        Animated.timing(pressProgress, {
          toValue: pressed ? 1 : 0,
          duration: pressed ? 120 : 160,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: pressed ? 0.98 : 1,
          useNativeDriver: true,
          speed: pressed ? 30 : 20,
          bounciness: pressed ? 0 : 6,
        }),
      ]).start();
    };

    const handlePressIn = () => {
      pressProgress.stopAnimation();
      scale.stopAnimation();
      pressProgress.setValue(0);
      scale.setValue(1);
      animatePressed(true);
    };

    const handlePressOut = () => {
      animatePressed(false);
    };

    return (
      <Pressable
        accessibilityRole="button"
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => {
          if (onPress && transaction) {
            onPress(transaction);
          }
        }}
      >
        <Animated.View
          style={[
            styles.screenRow,
            {
              opacity,
              transform: [{ translateY }, { scale }],
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pressOverlay,
              {
                opacity: pressOverlayOpacity,
                backgroundColor:
                  rowIndex % 2 === 0
                    ? listColors.primaryMuted
                    : listColors.surfaceTint,
              },
            ]}
          />
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
    overflow: "hidden",
    backgroundColor: listColors.surface,
  },
  screenRowEven: {
    backgroundColor: listColors.primaryMuted,
  },
  screenRowOdd: {
    backgroundColor: listColors.surfaceTint,
  },
  screenRowPressed: {
    opacity: 0.94,
  },
  pressOverlay: {
    ...StyleSheet.absoluteFillObject,
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
