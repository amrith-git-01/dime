import { format, isToday, parseISO } from "date-fns";
import {
  Calendar,
  Clock,
  CreditCard,
  FileText,
  X,
} from "lucide-react-native";
import { useEffect, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { ConfirmModal } from "@/components/shared";
import { Button } from "@/components/ui";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import {
  formatTransactionListAmount,
  mapTransactionRowToUi,
} from "@/features/transactions/utils/transactionDisplay";
import { useTransactionDetailScreenModel } from "@/screens/transactions/useTransactionDetailScreenModel";
import { createThemedStyles, useTheme } from "@/theme";

function formatIsoDate(iso: string): string {
  try {
    const date = parseISO(iso);
    const dateStr = format(date, "MMMM d, yyyy");
    return isToday(date) ? `${dateStr} · Today` : dateStr;
  } catch {
    return iso;
  }
}

function formatIsoTime(iso: string): string {
  try {
    return format(parseISO(iso), "h:mm a");
  } catch {
    return "";
  }
}

type MetaRowProps = {
  icon: ReactNode;
  label: string;
  value: string;
  isLast?: boolean;
};

function MetaRow({ icon, label, value, isLast = false }: MetaRowProps) {
  const styles = useStyles();
  return (
    <>
      <View style={styles.metaRow}>
        <View style={styles.metaIcon}>{icon}</View>
        <View style={styles.metaContent}>
          <Text style={styles.metaLabel}>{label}</Text>
          <Text style={styles.metaValue} numberOfLines={2}>
            {value}
          </Text>
        </View>
      </View>
      {!isLast && <View style={styles.metaDivider} />}
    </>
  );
}

const SPRING_CONFIG = { damping: 24, stiffness: 300, mass: 0.8 };

export default function TransactionDetailScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const model = useTransactionDetailScreenModel();
  const { transaction } = model;

  const { scheme } = useTheme();
  const ui = mapTransactionRowToUi(transaction, scheme);
  const isCredit = ui.amount > 0;

  const scale = useSharedValue(0.88);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, SPRING_CONFIG);
    opacity.value = withSpring(1, SPRING_CONFIG);
  }, [opacity, scale]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const hasNote = Boolean(transaction.note?.trim());

  return (
    <>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close transaction details"
          style={StyleSheet.absoluteFill}
          onPress={model.handleDismiss}
        />

        <Animated.View style={[styles.card, styles.cardShadow, cardStyle]}>
          {/* Header: category icon + merchant + header actions */}
          <View style={styles.cardHeader}>
            <View
              style={[styles.iconTile, { backgroundColor: ui.category.bgColor }]}
            >
              <CategoryLucideIcon
                iconName={ui.category.icon_name}
                color={ui.category.color}
                size={22}
                strokeWidth={1.5}
              />
            </View>
            <Text style={styles.merchantName}>
              {ui.merchant}
            </Text>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={12}
                onPress={model.handleDismiss}
                style={({ pressed }) => [
                  styles.closeBtn,
                  pressed && styles.closeBtnPressed,
                ]}
              >
                <X size={20} color={colors.ink} strokeWidth={1.5} />
              </Pressable>
            </View>
          </View>

          {/* Hero amount */}
          <View style={styles.heroSection}>
            <Text
              style={[
                styles.heroAmount,
                isCredit ? styles.heroCredit : styles.heroDebit,
              ]}
              numberOfLines={1}
            >
              {formatTransactionListAmount(ui.amount)}
            </Text>
            <View
              style={[
                styles.categoryChip,
                { backgroundColor: ui.category.bgColor },
              ]}
            >
              <CategoryLucideIcon
                iconName={ui.category.icon_name}
                color={ui.category.color}
                size={12}
                strokeWidth={1.5}
              />
              <Text
                style={[styles.categoryChipText, { color: ui.category.color }]}
                numberOfLines={1}
              >
                {ui.category.name}
              </Text>
            </View>
          </View>

          {/* Dashed separator */}
          <View style={styles.dashedSeparator} />

          {/* Meta rows — fixed 4 rows, no scroll needed */}
          <View>
            <MetaRow
              icon={<Calendar size={16} color={colors.inkFaint} strokeWidth={1.5} />}
              label="Date"
              value={formatIsoDate(transaction.transaction_at)}
            />
            <MetaRow
              icon={<Clock size={16} color={colors.inkFaint} strokeWidth={1.5} />}
              label="Time"
              value={formatIsoTime(transaction.transaction_at)}
            />
            <MetaRow
              icon={
                <CreditCard size={16} color={colors.inkFaint} strokeWidth={1.5} />
              }
              label="Source"
              value={ui.viaLabel}
            />
            <MetaRow
              icon={<FileText size={16} color={colors.inkFaint} strokeWidth={1.5} />}
              label="Notes"
              value={hasNote ? transaction.note!.trim() : "—"}
              isLast
            />
          </View>
          <View style={styles.actionsRow}>
            <View style={styles.actionSlot}>
              <Button
                title="Edit"
                variant="secondary"
                onPress={model.handleEdit}
              />
            </View>
            <View style={styles.actionSlot}>
              <Button
                title="Delete"
                variant="danger"
                onPress={model.handleDeletePress}
              />
            </View>
          </View>
        </Animated.View>
      </View>

      <ConfirmModal
        visible={model.confirmVisible}
        title="Delete transaction?"
        message="This removes it from Home, Insights, and budgets. You can’t undo this."
        cancelLabel="Cancel"
        confirmLabel="Delete"
        confirmBusyLabel="Deleting"
        confirmTone="danger"
        confirmLoading={model.deleteLoading}
        onCancel={model.handleCancelDelete}
        onConfirm={model.handleConfirmDelete}
      />
    </>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  cardShadow: shadows.modal,
  overlay: {
    flex: 1,
    backgroundColor: colors.overlays.scrimHeavy,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg + spacing.md,
  },
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: 28,
    paddingTop: spacing.lg,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  actionSlot: {
    flex: 1,
  },
  // Card header
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: spacing.xs,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  merchantName: {
    flex: 1,
    paddingTop: spacing.sm,
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  closeBtnPressed: {
    opacity: 0.6,
  },
  // Hero amount
  heroSection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  heroAmount: {
    fontFamily: fontFamilies.bold,
    fontSize: 36,
    lineHeight: 44,
    fontVariant: ["tabular-nums"],
  },
  heroDebit: {
    color: colors.accentText,
  },
  heroCredit: {
    color: colors.success,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    gap: 4,
  },
  categoryChipText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  // Dashed separator
  dashedSeparator: {
    height: 1,
    marginHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderStyle: "dashed",
    marginBottom: spacing.xs,
  },
  // Meta rows
  metaScroll: {
    maxHeight: 240,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  metaIcon: {
    width: 20,
    alignItems: "center",
    paddingTop: 2,
    flexShrink: 0,
  },
  metaContent: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  metaValue: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 19,
    color: colors.ink,
  },
  metaDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
  },
}));
