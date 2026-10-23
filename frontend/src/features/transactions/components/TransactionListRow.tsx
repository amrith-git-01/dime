import { memo, useEffect, useMemo, useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { listEntrance, springs, timings } from "@/constants/motion";
import { radius, spacing } from "@/constants";
import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { isPendingTransactionRow } from "@/features/outbox/utils/pendingMerge";
import type { TransactionRow } from "@/features/transactions/types";

import {
  formatTransactionListAmount,
  mapTransactionRowToUi,
  type TransactionCategory,
  type UiTransaction,
} from "@/features/transactions/utils/transactionDisplay";
import { createThemedStyles, useTheme } from "@/theme";

import { RecurringBadge } from "./RecurringBadge";
import { WaitingToSyncPill } from "./WaitingToSyncPill";

type CategoryIconProps = {
  category: TransactionCategory;
};

const CategoryIcon = memo(function CategoryIcon({
  category,
}: CategoryIconProps) {
  const styles = useStyles();
  return (
    <View
      style={[
        styles.categoryIcon,
        { backgroundColor: category.bgColor },
      ]}
    >
      <CategoryLucideIcon
        iconName={category.icon_name}
        color={category.color}
        size={20}
        strokeWidth={1.5}
      />
    </View>
  );
});

type CategoryTagProps = {
  name: string;
  borderColor: string;
  bgColor: string;
};

const CategoryTag = memo(function CategoryTag({
  name,
  borderColor,
  bgColor,
}: CategoryTagProps) {
  const styles = useStyles();
  return (
    <View
      style={[
        styles.categoryTag,
        {
          borderColor,
          backgroundColor: bgColor,
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

function RowBody({ ui, pending = false }: { ui: UiTransaction; pending?: boolean }) {
  const styles = useStyles();
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
            <CategoryTag name={ui.category.name} borderColor={ui.category.borderColor} bgColor={ui.category.bgColor} />
            <Text style={styles.tagViaSeparator}>|</Text>
            <Text
              style={styles.transactionVia}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {ui.viaLabel}
            </Text>
            {ui.isRecurring ? <RecurringBadge /> : null}
            {pending ? <WaitingToSyncPill /> : null}
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
  const styles = useStyles();
  const { scheme } = useTheme();
  const ui = useMemo(
    () => mapTransactionRowToUi(transaction, scheme),
    [transaction, scheme],
  );

  if (variant === "card") {
    const cardRowStyle: StyleProp<ViewStyle> = [
      styles.cardRow,
      !showBottomBorder && styles.cardRowLast,
    ];

    return (
      <View style={cardRowStyle}>
        <RowBody ui={ui} pending={isPendingTransactionRow(transaction)} />
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
    const styles = useStyles();
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
        <RowBody ui={ui} pending={isPendingTransactionRow(transaction)} />
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
    const { colors } = useTheme();
    const styles = useStyles();
    const opacity = useSharedValue<number>(listEntrance.opacityFrom);
    const translateY = useSharedValue<number>(listEntrance.translateYFrom);
    const scale = useSharedValue(1);
    const pressProgress = useSharedValue(0);
    const hasAnimatedIn = useRef(false);

    const overlayBackground =
      rowIndex % 2 === 0 ? colors.accentTint : colors.surfaceSunken;

    useEffect(() => {
      if (!isVisible || hasAnimatedIn.current) {
        return;
      }

      hasAnimatedIn.current = true;
      opacity.value = listEntrance.opacityFrom;
      translateY.value = listEntrance.translateYFrom;

      const delay = Math.min(
        animationOrder * listEntrance.homeStaggerMs,
        listEntrance.homeStaggerCapMs,
      );

      opacity.value = withDelay(delay, withTiming(1, timings.listEntrance));
      translateY.value = withDelay(delay, withTiming(0, timings.listEntrance));
    }, [animationOrder, isVisible, opacity, translateY]);

    const rowAnimatedStyle = useAnimatedStyle(() => ({
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }, { scale: scale.value }],
    }));

    const pressOverlayStyle = useAnimatedStyle(() => ({
      opacity: pressProgress.value,
    }));

    const handlePressIn = () => {
      cancelAnimation(pressProgress);
      cancelAnimation(scale);
      pressProgress.value = 0;
      scale.value = 1;
      pressProgress.value = withTiming(1, timings.pressIn);
      scale.value = withSpring(listEntrance.pressScale, springs.snappy);
    };

    const handlePressOut = () => {
      pressProgress.value = withTiming(0, timings.pressOut);
      scale.value = withSpring(1, springs.snappy);
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
            rowIndex % 2 === 0 ? styles.screenRowEven : styles.screenRowOdd,
            rowAnimatedStyle,
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pressOverlay,
              { backgroundColor: overlayBackground },
              pressOverlayStyle,
            ]}
          />
          <RowBody ui={ui} pending={transaction ? isPendingTransactionRow(transaction) : false} />
        </Animated.View>
      </Pressable>
    );
  },
);

const useStyles = createThemedStyles(({ colors, typography }) => ({
  screenRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  screenRowEven: {
    backgroundColor: colors.accentTint,
  },
  screenRowOdd: {
    backgroundColor: colors.surfaceSunken,
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
    borderBottomColor: colors.surfaceSunken,
  },
  cardRowLast: {
    borderBottomWidth: 0,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  transactionBody: {
    flex: 1,
    minWidth: 0,
  },
  transactionRowLine1: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  transactionRowLine2: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
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
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  categoryTagText: typography.transactionList.categoryTag,
  tagViaSeparator: typography.transactionList.tagSeparator,
  merchantName: typography.transactionList.merchant,
  transactionTime: typography.transactionList.time,
  transactionVia: typography.transactionList.via,
  transactionAmount: typography.transactionList.amount,
  positiveAmount: {
    color: colors.success,
  },
  debitRowAmount: {
    color: colors.danger,
  },
}));
