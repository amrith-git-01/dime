import { CircleAlert, Flame, Repeat } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { iconSizes, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { InsightsCard } from "@/features/analytics/components/InsightsCard";
import { createThemedStyles, useTheme, type ThemeColors } from "@/theme";

import type {
  ForecastActions,
  ForecastWatchItem,
  ForecastWatchKind,
} from "../types";
import { ForecastActionChip } from "./ForecastActionChip";

type WatchCardProps = {
  watch: readonly ForecastWatchItem[];
  actions: Omit<
    ForecastActions,
    | "onConfirmLikely"
    | "onDismissLikely"
    | "onOpenCategory"
  >;
};

const KIND_ICON: Record<ForecastWatchKind, LucideIcon> = {
  category_hot: Flame,
  unusual: CircleAlert,
  subscription_candidate: Repeat,
};

const KIND_LABEL: Record<ForecastWatchKind, string> = {
  category_hot: "Running hot",
  unusual: "Unusual spend",
  subscription_candidate: "Possible subscription",
};

function kindColor(kind: ForecastWatchKind, colors: ThemeColors): string {
  if (kind === "category_hot") return colors.warning;
  if (kind === "unusual") return colors.danger;
  return colors.accentText;
}

/**
 * Things worth a look this month: a category running hot, an unusually large payment, a payee
 * that looks like a subscription. Each card carries the answers the user can give.
 */
export const WatchCard = memo(function WatchCard({
  watch,
  actions,
}: WatchCardProps) {
  const styles = useStyles();
  return (
    <InsightsCard kicker="WATCH" subtitle="Worth a look this month">
      <View style={styles.list}>
        {watch.map((item, index) => (
          <View key={item.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <WatchRow item={item} actions={actions} />
          </View>
        ))}
      </View>
    </InsightsCard>
  );
});

function WatchRow({
  item,
  actions,
}: {
  item: ForecastWatchItem;
  actions: WatchCardProps["actions"];
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const Icon = KIND_ICON[item.kind];
  const tint = kindColor(item.kind, colors);

  const text = (
    <>
      <View style={styles.iconTile}>
        <Icon size={iconSizes.inline} color={tint} strokeWidth={1.75} />
      </View>
      <View style={styles.textBlock}>
        <Text style={[styles.kindLabel, { color: tint }]}>
          {KIND_LABEL[item.kind]}
        </Text>
        <Text style={styles.text}>{item.text}</Text>
      </View>
    </>
  );

  return (
    <View style={styles.row}>
      {item.kind === "unusual" ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${KIND_LABEL[item.kind]}. ${item.text}`}
          accessibilityHint="Opens the payment"
          onPress={() => actions.onOpenUnusual(item)}
          style={({ pressed }) => [styles.textRow, pressed && styles.pressed]}
        >
          {text}
        </Pressable>
      ) : (
        <View
          style={styles.textRow}
          accessible
          accessibilityLabel={`${KIND_LABEL[item.kind]}. ${item.text}`}
        >
          {text}
        </View>
      )}
      <View style={styles.actions}>
        {item.kind === "category_hot" ? (
          <>
            <ForecastActionChip
              label="See transactions"
              tone="primary"
              onPress={() => actions.onSeeCategoryTransactions(item)}
            />
            <ForecastActionChip
              label="Dismiss"
              onPress={() => actions.onDismissCategoryWatch(item)}
            />
          </>
        ) : null}
        {item.kind === "unusual" ? (
          <>
            <ForecastActionChip
              label="It's a one-off"
              tone="primary"
              onPress={() => actions.onMarkOneOff(item)}
            />
            <ForecastActionChip
              label="Not unusual"
              onPress={() => actions.onMarkNotUnusual(item)}
            />
          </>
        ) : null}
        {item.kind === "subscription_candidate" ? (
          <>
            <ForecastActionChip
              label="Track as recurring"
              tone="primary"
              onPress={() => actions.onTrackRecurring(item)}
            />
            <ForecastActionChip
              label="Not a subscription"
              onPress={() => actions.onDismissSubscription(item)}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  list: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  row: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  textRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  kindLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    lineHeight: 15,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  text: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingLeft: 32 + spacing.md,
  },
}));
