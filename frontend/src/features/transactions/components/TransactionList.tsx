import { Fragment } from "react";

import type { TransactionRow } from "@/features/transactions/types";

import { TransactionListRow } from "./TransactionListRow";

export type TransactionListProps = {
  items: TransactionRow[];
  /** `screen`: animated rows for main transactions list. `card`: compact rows inside a card (e.g. home). */
  variant?: "screen" | "card";
};

/**
 * Renders transaction rows with shared layout (merchant, time, category tag, amount, source).
 * Empty `items` yields `null` — keep empty-state copy in the parent.
 */
export function TransactionList({
  items,
  variant = "screen",
}: TransactionListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Fragment>
      {items.map((tx, index) => (
        <TransactionListRow
          key={tx.id}
          transaction={tx}
          variant={variant}
          rowIndex={index}
          animationOrder={index}
          showBottomBorder={
            variant === "card" ? index < items.length - 1 : true
          }
        />
      ))}
    </Fragment>
  );
}
