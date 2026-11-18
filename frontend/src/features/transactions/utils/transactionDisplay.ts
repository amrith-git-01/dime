import { format, parseISO } from "date-fns";

import { categoryDefault, hexToRgba, readableCategoryColor } from "@/constants";
import type { ColorScheme } from "@/theme";
import { detectedViaLabel } from "@/features/transactions/detectedViaLabel";
import type { TransactionKind, TransactionRow } from "@/features/transactions/types";
import { toPaise } from "@/utils/paise";

import { isRecurringTransaction } from "./isRecurringTransaction";
import { kindOf } from "./transactionKind";

export type TransactionCategory = {
  name: string;
  icon_name: string;
  color: string;
  /** Pre-computed rgba strings so FlashList row recycling does not parse hex in render. */
  bgColor: string;
  borderColor: string;
};

export type UiTransaction = {
  id: string;
  merchant: string;
  amount: number;
  category: TransactionCategory;
  timeLabel: string;
  viaLabel: string;
  dateKey: string;
  /** Posted by a recurring item, or filed under a recurring (fixed) category. */
  isRecurring: boolean;
  /** How the row counts. A transfer is drawn quiet: it is in neither spent nor income. */
  kind: TransactionKind;
  /** A capture the user should look at (possible duplicate, unsure parse). */
  needsReview: boolean;
  /** Pills drawn after the category, in order (every row and the detail use this one list). */
  badges: TransactionBadge[];
};

/**
 * A row that does not count the usual way: a transfer (in neither spent nor income), a payback (refund), a spend
 * someone paid back (`paidBack`), money received that pays back a spend (`paysBack`), or a capture to look at.
 */
export type TransactionBadge = "transfer" | "payback" | "paidBack" | "paysBack" | "review";

export function transactionBadges(tx: TransactionRow): TransactionBadge[] {
  const kind = kindOf(tx);
  const badges: TransactionBadge[] = [];
  if (kind === "transfer" || kind === "payback") badges.push(kind);
  // A refund already reads as "Payback"; a second pill for its link would say the same thing.
  if (kind !== "payback" && kind !== "transfer" && toPaise(tx.offset_total) > 0) {
    badges.push(tx.type === "credit" ? "paysBack" : "paidBack");
  }
  if (tx.needs_review === true) badges.push("review");
  return badges;
}

export function signedAmount(tx: TransactionRow): number {
  const n = Number.parseFloat(tx.amount);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return tx.type === "credit" ? n : -n;
}

/** Signed amount in integer paise (credits positive), for exact summing. */
export function signedAmountPaise(tx: TransactionRow): number {
  const paise = toPaise(tx.amount);
  return tx.type === "credit" ? paise : -paise;
}

export function mapTransactionRowToUi(
  tx: TransactionRow,
  scheme: ColorScheme,
): UiTransaction {
  const parsed = parseISO(tx.transaction_at);
  const dateKey = format(parsed, "yyyy-MM-dd");
  const iconName = tx.category_icon_name ?? "CreditCard";
  const color = readableCategoryColor(
    tx.category_color ?? categoryDefault,
    scheme,
  );
  const name = tx.category ?? "Uncategorized";
  const timeLabel = format(parsed, "h:mm a");

  return {
    id: tx.id,
    merchant: tx.merchant || tx.counterparty_name?.trim() || "\u2014",
    amount: signedAmount(tx),
    category: {
      name,
      icon_name: iconName,
      color,
      bgColor: hexToRgba(color, 0.1),
      borderColor: hexToRgba(color, 0.35),
    },
    timeLabel,
    viaLabel: detectedViaLabel(tx.detected_via),
    dateKey,
    isRecurring: isRecurringTransaction(tx),
    kind: kindOf(tx),
    needsReview: tx.needs_review === true,
    badges: transactionBadges(tx),
  };
}

/** Parse API decimal string totals for display math. */
export function parseTransactionAmount(value: string | undefined): number {
  if (value === undefined) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** List and section totals: signed whole rupees with +/- prefix. */
export function formatTransactionListAmount(amount: number): string {
  const absolute = Math.abs(amount).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  });

  if (amount > 0) {
    return `+\u20B9${absolute}`;
  }

  if (amount < 0) {
    return `-\u20B9${absolute}`;
  }

  return `\u20B9${absolute}`;
}
