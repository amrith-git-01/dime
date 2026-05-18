import { format, parseISO } from "date-fns";
import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, radius, spacing, typography } from "@/constants";
import {
  TransactionReceiptImage,
  TransactionVoicePlayer,
} from "@/components/transactions/TransactionAttachmentMedia";
import { detectedViaLabel } from "@/features/transactions/detectedViaLabel";
import type { TransactionRow } from "@/features/transactions/types";

type TransactionDetailMetaCardProps = {
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

function MetaRow({
  label,
  children,
  isLast = false,
}: {
  label: string;
  children: ReactNode;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

export const TransactionDetailMetaCard = memo(
  function TransactionDetailMetaCard({
    transaction: tx,
  }: TransactionDetailMetaCardProps) {
    const receiptUrl = hasMediaUrl(tx.receipt_url)
      ? tx.receipt_url.trim()
      : null;
    const voiceUrl = hasMediaUrl(tx.voice_url) ? tx.voice_url.trim() : null;
    const hasNote = Boolean(tx.note?.trim());
    const showReceipt = receiptUrl != null;
    const showVoice = voiceUrl != null;
    const lastRowIsVoice = showVoice;
    const lastRowIsReceipt = !showVoice && showReceipt;
    const lastRowIsNotes = !showVoice && !showReceipt;

    return (
      <View style={styles.card}>
        <MetaRow label="When">
          <Text style={styles.bodyTextMono} selectable>
            {formatIsoHuman(tx.transaction_at)}
          </Text>
        </MetaRow>

        <MetaRow label="Detected via">
          <Text style={styles.bodyText}>
            {detectedViaLabel(tx.detected_via)}
          </Text>
        </MetaRow>

        <MetaRow label="Counterparty">
          <Text style={styles.bodyText} selectable>
            {tx.counterparty_name?.trim() || "—"}
          </Text>
          <Text style={styles.caption}>{tx.counterparty_type}</Text>
        </MetaRow>

        <MetaRow label="Notes" isLast={lastRowIsNotes}>
          {hasNote ? (
            <Text style={styles.bodyText} selectable>
              {tx.note!.trim()}
            </Text>
          ) : (
            <Text style={styles.muted}>—</Text>
          )}
        </MetaRow>

        {showReceipt ? (
          <MetaRow label="Receipt" isLast={lastRowIsReceipt}>
            <TransactionReceiptImage url={receiptUrl} />
          </MetaRow>
        ) : null}

        {showVoice ? (
          <MetaRow label="Voice" isLast={lastRowIsVoice}>
            <TransactionVoicePlayer url={voiceUrl} />
          </MetaRow>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 0,
  },
  row: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  rowLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: colors.textSecondary,
    marginBottom: spacing.xs,
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
    marginTop: spacing.xs,
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
