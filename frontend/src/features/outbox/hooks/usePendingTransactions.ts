import { useMemo } from "react";

import type { OutboxItem } from "@/lib/outbox/outboxTypes";
import { useOutboxStore } from "@/stores/outboxStore";

import {
  pendingRowsFromItems,
  type PendingTransactionRow,
} from "../utils/pendingMerge";

/**
 * The user's not-yet-synced writes. `pendingRows` are the manual entries drawn like transactions
 * (merged into Home / Transactions at view-model level, never into the query cache); `items` is
 * everything, voice notes and receipt photos included, for the chip and the Pending sheet.
 */
export function usePendingTransactions(): {
  items: OutboxItem[];
  pendingRows: PendingTransactionRow[];
} {
  const userId = useOutboxStore((s) => s.userId);
  const items = useOutboxStore((s) => s.items);
  const pendingRows = useMemo(() => pendingRowsFromItems(items, userId), [items, userId]);
  return { items, pendingRows };
}
