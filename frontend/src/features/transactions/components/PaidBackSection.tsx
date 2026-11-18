import { format, parseISO } from "date-fns";
import { memo, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { ConfirmModal } from "@/components/shared";
import { fontFamilies, radius, spacing } from "@/constants";
import { useToast } from "@/features/toast/useToast";
import { createThemedStyles, useTheme } from "@/theme";
import { formatInrAmount } from "@/utils/currency";
import { paiseToAmountString, toPaise } from "@/utils/paise";

import {
  useCreateOffsetMutation,
  useDeleteOffsetMutation,
  usePaybackCandidatesQuery,
  useTransactionOffsetsQuery,
} from "../hooks/usePaybackLinks";
import { isOptimisticTransactionId } from "../optimistic/optimisticTransactionId";
import type { PaybackCandidate, TransactionRow } from "../types";
import { creditSummary } from "../utils/paybackSummary";
import { kindOf } from "../utils/transactionKind";

type PaidBackSectionProps = {
  transaction: TransactionRow;
  /** Open the picker as soon as the section shows (after saving money received from a person). */
  openPickerOnMount?: boolean;
  /** A tour sample or a row not on the server yet: nothing to link. */
  disabled?: boolean;
};

function shortDate(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM");
  } catch {
    return "";
  }
}

/**
 * Transaction detail, "Paid back":for a spend, the money people paid you back for it (a friend's share of a hotel, a
 * refund) with Unlink, and a picker to link a credit you received; for money received, the spends it pays back. A
 * spend's real cost is its amount minus what was paid back, counted in the spend's own month; the linked part of a
 * credit is not income.
 */
export const PaidBackSection = memo(function PaidBackSection({
  transaction,
  openPickerOnMount = false,
  disabled = false,
}: PaidBackSectionProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const kind = kindOf(transaction);
  const isSpend = transaction.type === "debit" && kind === "spend";
  const isCredit = transaction.type === "credit" && (kind === "income" || kind === "payback");
  const eligible = (isSpend || isCredit) && !disabled && !isOptimisticTransactionId(transaction.id);

  const offsetsQuery = useTransactionOffsetsQuery(transaction.id, { enabled: eligible });
  const createOffset = useCreateOffsetMutation();
  const deleteOffset = useDeleteOffsetMutation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const candidatesQuery = usePaybackCandidatesQuery(transaction.id, { enabled: eligible && pickerOpen });

  useEffect(() => {
    if (openPickerOnMount && eligible) {
      setPickerOpen(true);
    }
  }, [eligible, openPickerOnMount]);

  const offsets = offsetsQuery.data;
  // What is still unlinked on this row, in paise: the most a new link can carry.
  const remainingPaise = toPaise(offsets?.effective_amount ?? transaction.effective_amount ?? transaction.amount);

  const link = useCallback(
    (candidate: PaybackCandidate) => {
      const paise = Math.min(toPaise(candidate.remaining), remainingPaise);
      if (paise <= 0) {
        return;
      }
      const other = candidate.transaction;
      createOffset
        .mutateAsync({
          credit_id: isCredit ? transaction.id : other.id,
          debit_id: isCredit ? other.id : transaction.id,
          amount: paiseToAmountString(paise),
        })
        .then(() => {
          setPickerOpen(false);
          showToast({ variant: "success", message: "Linked" });
        })
        .catch((error: unknown) => {
          showToast({
            variant: "error",
            message: error instanceof Error && error.message ? error.message : "Could not link these.",
          });
        });
    },
    [createOffset, isCredit, remainingPaise, showToast, transaction.id],
  );

  const unlink = useCallback(
    (offsetId: string) => {
      deleteOffset.mutateAsync(offsetId).catch((error: unknown) => {
        showToast({
          variant: "error",
          message: error instanceof Error && error.message ? error.message : "Could not unlink.",
        });
      });
    },
    [deleteOffset, showToast],
  );

  if (!eligible) {
    return null;
  }

  const title = isSpend ? "PAID BACK" : "PAYS BACK";
  const linkLabel = isSpend ? "Link money you got back" : "Link to a spend";
  const items = offsets?.items ?? [];
  const summary = offsets
    ? isSpend
      ? `${formatInrAmount(offsets.offset_total)} paid back · costs you ${formatInrAmount(offsets.effective_amount)}`
      : creditSummary(kind, offsets.offset_total, offsets.effective_amount)
    : null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {offsetsQuery.isPending ? (
        <ActivityIndicator size="small" color={colors.accentText} />
      ) : (
        <>
          {summary && items.length > 0 ? <Text style={styles.summary}>{summary}</Text> : null}
          {items.map((item) => (
            <View key={item.id} style={styles.linkRow}>
              <View style={styles.linkText}>
                <Text style={styles.linkName} numberOfLines={1}>
                  {item.transaction.merchant || item.transaction.counterparty_name || "Transaction"}
                </Text>
                <Text style={styles.linkMeta}>
                  {`${shortDate(item.transaction.transaction_at)} · ${formatInrAmount(item.amount)}`}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Unlink"
                disabled={deleteOffset.isPending}
                hitSlop={8}
                onPress={() => unlink(item.id)}
                style={({ pressed }) => [styles.unlink, pressed && styles.pressed]}
              >
                <Text style={styles.unlinkText}>Unlink</Text>
              </Pressable>
            </View>
          ))}
          {remainingPaise > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setPickerOpen(true)}
              style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
            >
              <Text style={styles.linkButtonText}>{linkLabel}</Text>
            </Pressable>
          ) : null}
        </>
      )}

      <ConfirmModal
        visible={pickerOpen}
        title={isSpend ? "Who paid you back?" : "What did this pay back?"}
        message={
          candidatesQuery.isError
            ? "Could not load suggestions. Try again."
            : candidatesQuery.data && candidatesQuery.data.length === 0
              ? "Nothing to link yet. Candidates are money received (or spends) within 45 days."
              : null
        }
        loading={candidatesQuery.isPending}
        showCancel={false}
        confirmLabel="Close"
        onCancel={() => setPickerOpen(false)}
        onConfirm={() => setPickerOpen(false)}
      >
        {(candidatesQuery.data ?? []).map((candidate) => (
          <Pressable
            key={candidate.transaction.id}
            accessibilityRole="button"
            accessibilityLabel={`Link ${candidate.transaction.merchant}`}
            disabled={createOffset.isPending}
            onPress={() => link(candidate)}
            style={({ pressed }) => [styles.candidate, pressed && styles.pressed]}
          >
            <View style={styles.linkText}>
              <Text style={styles.linkName} numberOfLines={1}>
                {candidate.transaction.merchant || candidate.transaction.counterparty_name || "Transaction"}
              </Text>
              <Text style={styles.linkMeta}>
                {`${shortDate(candidate.transaction.transaction_at)}${candidate.payee_match ? " · same payee" : ""}`}
              </Text>
            </View>
            <Text style={styles.candidateAmount}>{formatInrAmount(candidate.remaining)}</Text>
          </Pressable>
        ))}
      </ConfirmModal>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  section: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.3,
    color: colors.inkSoft,
  },
  summary: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  linkText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  linkName: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 19,
    color: colors.ink,
  },
  linkMeta: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  unlink: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  unlinkText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.danger,
  },
  linkButton: {
    alignSelf: "flex-start",
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
  },
  linkButtonText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    color: colors.accentText,
  },
  candidate: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  candidateAmount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  pressed: {
    opacity: 0.7,
  },
}));
