import { ArrowDownLeft, Receipt, Sparkles } from "lucide-react-native";
import { memo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { iconSizes, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { InsightsCard } from "@/features/analytics/components/InsightsCard";
import { createThemedStyles, useTheme } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

import type {
  ForecastActions,
  ForecastUpcomingItem,
  ForecastUpcomingKind,
} from "../types";
import { confidenceDots, groupUpcomingByDate } from "../utils/forecastFormat";
import { ForecastActionChip } from "./ForecastActionChip";

/** More than this many rows start folded behind "Show more". */
export const COMING_UP_COLLAPSED_ROWS = 6;

type ComingUpCardProps = {
  upcoming: readonly ForecastUpcomingItem[];
  /** The server's today (`YYYY-MM-DD`), which the day labels count from. */
  today: string;
  actions: Pick<ForecastActions, "onConfirmLikely" | "onDismissLikely">;
};

const KIND_LABEL: Record<ForecastUpcomingKind, string> = {
  bill: "Bill",
  likely: "Likely",
  income: "Income",
};

/**
 * The next 14 days: bills, spends Dime expects from the user's habits (tap one to answer "Yes,
 * usual" or "Not expected") and income, grouped by day.
 */
export const ComingUpCard = memo(function ComingUpCard({
  upcoming,
  today,
  actions,
}: ComingUpCardProps) {
  const styles = useStyles();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Fold the list by rows, not by days, so a busy day cannot push the card off the screen.
  const hidden = showAll
    ? 0
    : Math.max(0, upcoming.length - COMING_UP_COLLAPSED_ROWS);
  const visible = hidden > 0 ? upcoming.slice(0, COMING_UP_COLLAPSED_ROWS) : upcoming;
  const groups = groupUpcomingByDate(visible, today);

  return (
    <InsightsCard kicker="COMING UP" subtitle="The next 14 days">
      {groups.length === 0 ? (
        <Text style={styles.empty}>
          Nothing expected in the next 14 days.
        </Text>
      ) : (
        <View style={styles.list}>
          {groups.map((group) => (
            <View key={group.date} style={styles.group}>
              <Text style={styles.dayLabel}>{group.label}</Text>
              {group.items.map((item) => (
                <UpcomingRow
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() =>
                    setExpandedId((current) =>
                      current === item.id ? null : item.id,
                    )
                  }
                  onConfirm={() => {
                    setExpandedId(null);
                    actions.onConfirmLikely(item);
                  }}
                  onDismiss={() => {
                    setExpandedId(null);
                    actions.onDismissLikely(item);
                  }}
                />
              ))}
            </View>
          ))}
          {hidden > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Show ${hidden} more`}
              hitSlop={8}
              onPress={() => setShowAll(true)}
              style={({ pressed }) => [styles.more, pressed && styles.pressed]}
            >
              <Text style={styles.moreText}>{`Show ${hidden} more`}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </InsightsCard>
  );
});

type UpcomingRowProps = {
  item: ForecastUpcomingItem;
  expanded: boolean;
  onToggle: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
};

function UpcomingRow({
  item,
  expanded,
  onToggle,
  onConfirm,
  onDismiss,
}: UpcomingRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const isLikely = item.kind === "likely";
  const isIncome = item.kind === "income";
  const Icon =
    item.kind === "bill" ? Receipt : isLikely ? Sparkles : ArrowDownLeft;
  const iconColor = isIncome
    ? colors.success
    : isLikely
      ? colors.accentText
      : colors.inkSoft;
  const dots = isLikely ? confidenceDots(item.confidence) : 0;
  const amount = formatInrCompact(item.amount);
  const amountText = isLikely ? `~${amount}` : isIncome ? `+${amount}` : amount;
  const confidencePct =
    item.confidence === undefined ? null : Math.round(item.confidence * 100);
  const spoken = [
    item.name,
    isLikely ? "likely" : KIND_LABEL[item.kind].toLowerCase(),
    amount,
    confidencePct === null || !isLikely ? null : `${confidencePct}% sure`,
  ]
    .filter(Boolean)
    .join(", ");

  const content = (
    <>
      <View style={styles.iconTile}>
        <Icon
          size={iconSizes.inline}
          color={iconColor}
          strokeWidth={1.75}
        />
      </View>
      <View style={styles.rowMeta}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.subRow}>
          <Text style={styles.sub}>{KIND_LABEL[item.kind]}</Text>
          {isLikely ? (
            <View style={styles.dots}>
              {[1, 2, 3].map((n) => (
                <View
                  key={n}
                  style={[styles.dot, n <= dots && styles.dotFilled]}
                />
              ))}
            </View>
          ) : null}
        </View>
      </View>
      <Text
        style={[
          styles.amount,
          isIncome && styles.amountIncome,
          isLikely && styles.amountLikely,
        ]}
      >
        {amountText}
      </Text>
    </>
  );

  if (!isLikely) {
    return (
      <View style={styles.row} accessible accessibilityLabel={spoken}>
        {content}
      </View>
    );
  }
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityHint="Choose Yes, usual or Not expected"
        accessibilityState={{ expanded }}
        accessibilityActions={[
          { name: "confirm", label: "Yes, usual" },
          { name: "dismiss", label: "Not expected" },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "confirm") onConfirm();
          if (event.nativeEvent.actionName === "dismiss") onDismiss();
        }}
        onPress={onToggle}
        onLongPress={onToggle}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
      {expanded ? (
        <View style={styles.answers}>
          <ForecastActionChip label="Yes, usual" tone="primary" onPress={onConfirm} />
          <ForecastActionChip label="Not expected" onPress={onDismiss} />
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  list: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  group: {
    gap: spacing.xs,
  },
  dayLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkFaint,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 6,
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
  rowMeta: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  sub: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  dots: {
    flexDirection: "row",
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
  },
  dotFilled: {
    backgroundColor: colors.accentText,
  },
  amount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  amountIncome: {
    color: colors.success,
  },
  amountLikely: {
    fontFamily: fontFamilies.medium,
    color: colors.inkSoft,
  },
  answers: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingLeft: 32 + spacing.md,
    paddingBottom: spacing.xs,
  },
  more: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
  },
  moreText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.accentText,
  },
  empty: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
}));
