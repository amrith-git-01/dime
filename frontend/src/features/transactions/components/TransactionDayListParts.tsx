import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  CARD_SEGMENT_SHADOW_BLEED,
  CARD_SEGMENT_SHADOW_TOP_BLEED,
  SurfaceCardSegment,
} from "@/components/shared";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme } from "@/theme";

import type { TransactionRow as TransactionRowType } from "../types";
import type {
  TransactionListHeaderItem,
  TransactionListItem,
  TransactionListRowItem,
} from "../utils/buildTransactionFlashListData";
import { formatTransactionListAmount } from "../utils/transactionDisplay";
import { isFutureDayKey } from "../utils/transactionsCalendar";

import { DayAddButton } from "./DayAddButton";
import { TransactionRow } from "./TransactionRow";

/**
 * The date-grouped list's parts (day header with the day's net total, and a row segment), shared by
 * the pushed filtered list and the Transactions tab's list view.
 */

type DayHeaderProps = {
  item: TransactionListHeaderItem;
  onAdd: (dayKey: string) => void;
};

export const DayHeader = memo(function DayHeader({ item, onAdd }: DayHeaderProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const netTotal = item.netTotal;
  const netColor = netTotal < 0 ? colors.danger : netTotal > 0 ? colors.success : colors.inkSoft;

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{item.title}</Text>
      <View style={styles.sectionTrailing}>
        <Text style={[styles.sectionTotal, { color: netColor }]}>
          {formatTransactionListAmount(netTotal)}
        </Text>
        {isFutureDayKey(item.dayKey) ? null : (
          <DayAddButton dayKey={item.dayKey} onPress={onAdd} />
        )}
      </View>
    </View>
  );
});

type TransactionListRowViewProps = {
  item: TransactionListRowItem;
  onTransactionPress: (transaction: TransactionRowType) => void;
};

export const TransactionListRowView = memo(function TransactionListRowView({
  item,
  onTransactionPress,
}: TransactionListRowViewProps) {
  const styles = useStyles();
  return (
    <View style={item.isLastInSection ? styles.lastRowInSection : undefined}>
      <SurfaceCardSegment
        isFirst={item.isFirstInSection}
        isLast={item.isLastInSection}
      >
        {item.isFirstInSection ? null : <View style={styles.rowDivider} />}
        <TransactionRow
          transaction={item.transaction}
          onPress={onTransactionPress}
        />
      </SurfaceCardSegment>
    </View>
  );
});

export function transactionListKeyExtractor(item: TransactionListItem): string {
  return item.id;
}

export function transactionListItemType(
  item: TransactionListItem,
): TransactionListItem["kind"] {
  return item.kind;
}

const useStyles = createThemedStyles(({ colors }) => ({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
    // The first row segment reserves top room for its card shadow.
    paddingBottom: spacing.md - CARD_SEGMENT_SHADOW_TOP_BLEED,
    backgroundColor: colors.paper,
  },
  sectionTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  sectionTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionTotal: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
  },
  lastRowInSection: {
    // The last row segment reserves bottom room for its card shadow.
    paddingBottom: spacing.xl - CARD_SEGMENT_SHADOW_BLEED,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
}));
