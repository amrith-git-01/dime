import { format, parseISO } from "date-fns";

import { detectedViaLabel } from "@/features/transactions/detectedViaLabel";
import type { TransactionRow } from "@/features/transactions/types";

export type TransactionCategory = {
  name: string;
  emoji: string;
  color: string;
};

export type UiTransaction = {
  id: string;
  merchant: string;
  amount: number;
  category: TransactionCategory;
  timeLabel: string;
  viaLabel: string;
  dateKey: string;
};

export function signedAmount(tx: TransactionRow): number {
  const n = Number.parseFloat(tx.amount);
  if (!Number.isFinite(n)) {
    return 0;
  }
  return tx.type === "credit" ? n : -n;
}

export function mapTransactionRowToUi(tx: TransactionRow): UiTransaction {
  const parsed = parseISO(tx.transaction_at);
  const dateKey = format(parsed, "yyyy-MM-dd");
  const emoji = tx.category_emoji ?? "💳";
  const color = tx.category_color ?? "#94A3B8";
  const name = tx.category ?? "Uncategorized";
  const timeLabel = format(parsed, "h:mm a");
  return {
    id: tx.id,
    merchant: tx.merchant || tx.counterparty_name?.trim() || "—",
    amount: signedAmount(tx),
    category: { name, emoji, color },
    timeLabel,
    viaLabel: detectedViaLabel(tx.detected_via),
    dateKey,
  };
}

/** List / section totals: signed whole rupees with +/− prefix. */
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

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const bigint = Number.parseInt(normalized, 16);
  const red = (bigint >> 16) & 255;
  const green = (bigint >> 8) & 255;
  const blue = bigint & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
