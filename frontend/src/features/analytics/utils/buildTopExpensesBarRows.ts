import { format, parseISO } from "date-fns";

import { COUNTERPARTY_DONUT_SLICE_COLORS } from "@/features/analytics/constants/counterpartyDonutColors";
import type { TransactionRow } from "@/features/transactions/types";
import { formatInrCompact } from "@/utils/currency";

export const TOP_EXPENSES_ROW_COUNT = 5;

const EM_DASH = "\u2014";

export type TopExpenseBarRow = {
  key: string;
  merchant: string;
  meta: string;
  amountDisplay: string;
  barFraction: number;
  barColor: string;
  transaction: TransactionRow | null;
  isPlaceholder: boolean;
};

function debitAmount(tx: TransactionRow): number {
  const n = Number.parseFloat(tx.amount);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function formatExpenseMeta(tx: TransactionRow): string {
  const category = tx.category?.trim() || "Uncategorized";
  try {
    const dateLabel = format(parseISO(tx.transaction_at), "d MMM");
    return `${category} · ${dateLabel}`;
  } catch {
    return category;
  }
}

function merchantLabel(tx: TransactionRow): string {
  return tx.merchant?.trim() || tx.counterparty_name?.trim() || EM_DASH;
}

function placeholderRow(index: number): TopExpenseBarRow {
  return {
    key: `placeholder-${index}`,
    merchant: EM_DASH,
    meta: EM_DASH,
    amountDisplay: EM_DASH,
    barFraction: 0,
    barColor: COUNTERPARTY_DONUT_SLICE_COLORS[0],
    transaction: null,
    isPlaceholder: true,
  };
}

/** Up to five largest debits with bar width relative to the top amount; pads with placeholders. */
export function buildTopExpensesBarRows(
  transactions: TransactionRow[],
): TopExpenseBarRow[] {
  const visible = transactions.slice(0, TOP_EXPENSES_ROW_COUNT);
  const maxAmount = visible.reduce(
    (max, tx) => Math.max(max, debitAmount(tx)),
    0,
  );

  const rows: TopExpenseBarRow[] = visible.map((tx, index) => {
    const amount = debitAmount(tx);
    const barFraction =
      maxAmount > 0 ? Math.max(0.06, amount / maxAmount) : 0.06;

    return {
      key: tx.id,
      merchant: merchantLabel(tx),
      meta: formatExpenseMeta(tx),
      amountDisplay: amount > 0 ? formatInrCompact(amount) : EM_DASH,
      barFraction,
      barColor:
        COUNTERPARTY_DONUT_SLICE_COLORS[
          index % COUNTERPARTY_DONUT_SLICE_COLORS.length
        ],
      transaction: tx,
      isPlaceholder: false,
    };
  });

  while (rows.length < TOP_EXPENSES_ROW_COUNT) {
    rows.push(placeholderRow(rows.length));
  }

  return rows;
}
