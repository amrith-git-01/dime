import { format, parseISO } from "date-fns";
import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  TransactionDetailBentoCard,
  TransactionDetailField,
} from "@/components/transactions/bento/TransactionDetailBentoCard";
import { TransactionDetailHeroBento } from "@/components/transactions/bento/TransactionDetailHeroBento";
import { TRANSACTION_DETAIL_SECTION_GAP } from "@/components/transactions/bento/transactionDetailBentoTokens";
import { fontFamilies } from "@/constants/fonts";
import { colors, typography } from "@/constants/theme";
import { detectedViaLabel } from "@/features/transactions/detectedViaLabel";
import type { TransactionRow } from "@/features/transactions/types";

import {
  TransactionReceiptImage,
  TransactionVoicePlayer,
} from "./TransactionAttachmentMedia";

export type TransactionDetailBodyProps = {
  transaction: TransactionRow;
};

function formatIsoHuman(iso: string | null | undefined): string {
  if (iso == null || iso.length === 0) {
    return "—";
  }
  try {
    return format(parseISO(iso), "d MMM yyyy, h:mm a");
  } catch {
    return iso;
  }
}

function hasMediaUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const TransactionDetailBody = memo(function TransactionDetailBody({
  transaction: tx,
}: TransactionDetailBodyProps) {
  const receiptUrl = hasMediaUrl(tx.receipt_url) ? tx.receipt_url.trim() : null;
  const voiceUrl = hasMediaUrl(tx.voice_url) ? tx.voice_url.trim() : null;

  const whenLabel = useMemo(
    () => formatIsoHuman(tx.transaction_at),
    [tx.transaction_at],
  );

  return (
    <View style={styles.root}>
      <TransactionDetailHeroBento transaction={tx} />

      {receiptUrl ? (
        <TransactionDetailBentoCard title="Receipt">
          <TransactionReceiptImage url={receiptUrl} />
        </TransactionDetailBentoCard>
      ) : null}

      {voiceUrl ? (
        <TransactionDetailBentoCard title="Voice">
          <TransactionVoicePlayer url={voiceUrl} />
        </TransactionDetailBentoCard>
      ) : null}

      <TransactionDetailBentoCard>
        <TransactionDetailField label="When">
          <Text style={styles.bodyTextMono} selectable>
            {whenLabel}
          </Text>
        </TransactionDetailField>

        <TransactionDetailField label="Detected via">
          <Text style={styles.bodyText}>
            {detectedViaLabel(tx.detected_via)}
          </Text>
        </TransactionDetailField>

        <TransactionDetailField label="Counterparty">
          <Text style={styles.bodyText} selectable>
            {tx.counterparty_name?.trim() || "—"}
          </Text>
          <Text style={styles.caption}>{tx.counterparty_type}</Text>
        </TransactionDetailField>

        <TransactionDetailField label="Notes" isLast>
          {tx.note?.trim() ? (
            <Text style={styles.bodyText} selectable>
              {tx.note.trim()}
            </Text>
          ) : (
            <Text style={styles.muted}>—</Text>
          )}
        </TransactionDetailField>
      </TransactionDetailBentoCard>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: TRANSACTION_DETAIL_SECTION_GAP,
  },
  bodyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  bodyTextMono: {
    fontFamily: typography.monoEmphasis.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  caption: {
    marginTop: 4,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  muted: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});
