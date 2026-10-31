import {
  ArrowDownLeft,
  ArrowUpRight,
  Ellipsis,
  Repeat,
} from "lucide-react-native";
import { memo, useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { fontFamilies, radius, spacing } from "@/constants";
import { formatOccurrenceDate } from "@/features/recurring/utils/recurringDisplay";
import { formatInrAmount } from "@/utils/currency";
import { createThemedStyles, useTheme } from "@/theme";

import type { Reminder } from "../types";
import { canNudge, canPayNow } from "../utils/reminderActions";
import { exceedsPayLimit, PAY_LIMIT_LABEL } from "../utils/payLinks";
import {
  dueLabel,
  formatCadenceLabel,
  reminderSubtitle,
} from "../utils/reminderDates";
import {
  formatClosedLine,
  markDoneLabel,
  reminderAccessibilityLabel,
} from "../utils/reminderLabels";

export type ReminderRowProps = {
  reminder: Reminder;
  /** Start of the current local day, for the due-date wording. */
  today: Date;
  /** `compact` is Home's Upcoming card: the plain tappable row, no buttons. */
  variant?: "list" | "compact";
  /** Briefly tinted after a notification or a tap on Home pointed here. */
  highlighted?: boolean;
  /** An action on this row is running. */
  busy?: boolean;
  /** Tap on the row: open the editor (list) or the list (compact). */
  onPress: (reminder: Reminder) => void;
  /** `transactionId` set: the "Looks paid" suggestion was accepted. */
  onMarkDone?: (reminder: Reminder, transactionId?: string) => void;
  onPayNow?: (reminder: Reminder) => void;
  onNudge?: (reminder: Reminder) => void;
  onSkip?: (reminder: Reminder) => void;
  onDelete?: (reminder: Reminder) => void;
  onReopen?: (reminder: Reminder) => void;
};

type ActionPillProps = {
  label: string;
  onPress: () => void;
  tone?: "primary" | "neutral" | "danger";
  disabled?: boolean;
};

/** A small pill button of a row (44pt tall so it is easy to hit). */
function ActionPill({ label, onPress, tone = "neutral", disabled }: ActionPillProps) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        tone === "primary" && styles.pillPrimary,
        tone === "danger" && styles.pillDanger,
        disabled && styles.pillDisabled,
        pressed && !disabled && styles.pillPressed,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.pillText,
          tone === "primary" && styles.pillTextPrimary,
          tone === "danger" && styles.pillTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One reminder: direction tile, title, who and when, amount, a repeat badge, the "Looks paid"
 * suggestion, and (in the list) its actions. Money out is red, money in green, like every other
 * amount; an overdue date is the only other colour. Dividers are the parent's job.
 */
export const ReminderRow = memo(function ReminderRow({
  reminder,
  today,
  variant = "list",
  highlighted = false,
  busy = false,
  onPress,
  onMarkDone,
  onPayNow,
  onNudge,
  onSkip,
  onDelete,
  onReopen,
}: ReminderRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [moreOpen, setMoreOpen] = useState(false);
  const handlePress = useCallback(() => onPress(reminder), [onPress, reminder]);

  const isOpen = reminder.status === "open";
  const isReceive = reminder.direction === "receive";
  const due = dueLabel(reminder.due_date, today);
  const overdue = isOpen && due.tone === "overdue";
  const match = isOpen ? reminder.suggested_match : null;
  const compact = variant === "compact";
  const Icon = isReceive ? ArrowDownLeft : ArrowUpRight;
  const repeats = reminder.cadence !== "none";
  // An amount above the pay-link limit has no Pay now / pay link: say so instead of leaving it out silently.
  const limitHint =
    isOpen && exceedsPayLimit(reminder.amount)
      ? isReceive
        ? `Pay links work up to ${PAY_LIMIT_LABEL}, so a nudge for this amount has no link.`
        : reminder.upi_id
          ? `Pay now works up to ${PAY_LIMIT_LABEL}. Use your UPI app for this one.`
          : null
      : null;

  const subtitle = isOpen
    ? reminderSubtitle(reminder, today)
    : [reminder.counterparty_name?.trim(), formatClosedLine(reminder)]
        .filter(Boolean)
        .join(" · ");

  return (
    <View style={[styles.row, highlighted && styles.rowHighlighted, !isOpen && styles.rowClosed]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={reminderAccessibilityLabel(reminder, today)}
        onPress={handlePress}
        style={({ pressed }) => [styles.main, pressed && styles.mainPressed]}
      >
        <View style={[styles.tile, overdue && styles.tileOverdue]}>
          <Icon
            size={18}
            strokeWidth={1.75}
            color={overdue ? colors.danger : colors.inkSoft}
          />
        </View>
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={2}>
            {reminder.title}
          </Text>
          <Text
            style={[styles.subtitle, overdue && styles.subtitleOverdue]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
          {repeats ? (
            <View style={styles.badge}>
              <Repeat size={11} strokeWidth={2} color={colors.inkSoft} />
              <Text style={styles.badgeText}>
                {formatCadenceLabel(reminder.cadence)}
              </Text>
            </View>
          ) : null}
        </View>
        {reminder.amount !== null ? (
          <Text
            style={[styles.amount, isReceive ? styles.credit : styles.debit]}
            numberOfLines={1}
          >
            {formatInrAmount(reminder.amount, {
              signed: true,
              type: isReceive ? "credit" : "debit",
            })}
          </Text>
        ) : null}
      </Pressable>

      {compact ? null : (
        <>
          {match ? (
            <View style={styles.suggestion}>
              <View style={styles.suggestionText}>
                <Text style={styles.suggestionLabel}>Looks paid</Text>
                <Text style={styles.suggestionDetail} numberOfLines={2}>
                  {`${formatInrAmount(match.amount)}${match.display_name ? ` ${isReceive ? "from" : "to"} ${match.display_name}` : ""}${match.date ? ` on ${formatOccurrenceDate(match.date, today)}` : ""}`}
                </Text>
              </View>
              <ActionPill
                label={markDoneLabel(reminder)}
                tone="primary"
                disabled={busy}
                onPress={() => onMarkDone?.(reminder, match.transaction_id)}
              />
            </View>
          ) : null}

          <View style={styles.actions}>
            {isOpen ? (
              <>
                {match ? null : (
                  <ActionPill
                    label={markDoneLabel(reminder)}
                    tone="primary"
                    disabled={busy}
                    onPress={() => onMarkDone?.(reminder)}
                  />
                )}
                {canPayNow(reminder) ? (
                  <ActionPill
                    label="Pay now"
                    disabled={busy}
                    onPress={() => onPayNow?.(reminder)}
                  />
                ) : null}
                {canNudge(reminder) ? (
                  <ActionPill
                    label="Nudge"
                    disabled={busy}
                    onPress={() => onNudge?.(reminder)}
                  />
                ) : null}
              </>
            ) : (
              <ActionPill
                label="Reopen"
                disabled={busy}
                onPress={() => onReopen?.(reminder)}
              />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${reminder.title}`}
              accessibilityState={{ expanded: moreOpen }}
              onPress={() => setMoreOpen((open) => !open)}
              style={({ pressed }) => [styles.more, pressed && styles.pillPressed]}
            >
              <Ellipsis size={18} strokeWidth={1.75} color={colors.inkSoft} />
            </Pressable>
          </View>

          {limitHint ? (
            <Text style={styles.limitHint} accessibilityLiveRegion="polite">
              {limitHint}
            </Text>
          ) : null}

          {moreOpen ? (
            <View style={styles.actions}>
              {match ? (
                <ActionPill
                  label={`${markDoneLabel(reminder)}, no match`}
                  disabled={busy}
                  onPress={() => onMarkDone?.(reminder)}
                />
              ) : null}
              {isOpen && repeats ? (
                <ActionPill
                  label="Skip"
                  disabled={busy}
                  onPress={() => onSkip?.(reminder)}
                />
              ) : null}
              {isOpen ? (
                <ActionPill label="Edit" onPress={handlePress} />
              ) : null}
              <ActionPill
                label="Delete"
                tone="danger"
                disabled={busy}
                onPress={() => onDelete?.(reminder)}
              />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  rowHighlighted: {
    backgroundColor: colors.accentTint,
  },
  rowClosed: {
    opacity: 0.7,
  },
  main: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 44,
  },
  mainPressed: {
    opacity: 0.85,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: colors.surfaceSunken,
  },
  tileOverdue: {
    backgroundColor: colors.dangerTint,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 19,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  subtitleOverdue: {
    color: colors.danger,
    fontFamily: fontFamilies.medium,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginTop: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
  },
  badgeText: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.inkSoft,
  },
  amount: {
    flexShrink: 0,
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 19,
    fontVariant: ["tabular-nums"],
  },
  credit: {
    color: colors.success,
  },
  debit: {
    color: colors.danger,
  },
  limitHint: {
    paddingLeft: 40 + spacing.md,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.successTint,
  },
  suggestionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  suggestionLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.success,
  },
  suggestionDetail: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    // Lines up with the title, not the direction tile.
    paddingLeft: 40 + spacing.md,
  },
  pill: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSunken,
  },
  pillPrimary: {
    backgroundColor: colors.accentTint,
  },
  pillDanger: {
    backgroundColor: colors.dangerTint,
  },
  pillDisabled: {
    opacity: 0.5,
  },
  pillPressed: {
    opacity: 0.7,
  },
  pillText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  pillTextPrimary: {
    color: colors.accentText,
  },
  pillTextDanger: {
    color: colors.danger,
  },
  more: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
}));
