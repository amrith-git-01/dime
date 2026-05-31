import { format, parseISO } from "date-fns";

import { hexToRgba } from "@/constants/colorUtils";
import { colors } from "@/constants";
import { detectedViaLabel } from "@/features/transactions/detectedViaLabel";
import type { TransactionRow } from "@/features/transactions/types";

export type TransactionCategory = {
  name: string;
  icon_name: string;
  color: string;
  /** Pre-computed rgba strings — avoids hex parsing on every FlashList recycle. */
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
  const iconName = tx.category_icon_name ?? "CreditCard";
  const color = tx.category_color ?? colors.categoryDefault;
  const name = tx.category ?? "Uncategorized";
  const timeLabel = format(parsed, "h:mm a");
  return {
    id: tx.id,
    merchant: tx.merchant || tx.counterparty_name?.trim() || "—",
    amount: signedAmount(tx),
    category: {
      name,
      icon_name: iconName,
      color,
      // Computed once here at data-arrival time — not on every render/recycle.
      bgColor: hexToRgba(color, 0.1),
      borderColor: hexToRgba(color, 0.35),
    },
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

export { hexToRgba } from "@/constants/colorUtils";
