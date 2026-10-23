import type { CreateTransactionBody } from "@/features/transactions/api/transactionsApi";
import type { OutboxManualPreview } from "@/lib/outbox/outboxTypes";

type CategoryDisplay = { id: string; icon_name: string; color: string };

/** What a waiting manual entry shows in lists: the payload plus the category's icon and colour. */
export function buildManualPreview(
  body: CreateTransactionBody,
  categories: readonly CategoryDisplay[],
): OutboxManualPreview {
  const category = body.category_id
    ? categories.find((candidate) => candidate.id === body.category_id)
    : undefined;
  return {
    amount: body.amount,
    type: body.type,
    counterparty_name: body.counterparty_name,
    counterparty_type: body.counterparty_type,
    category: body.category,
    category_id: body.category_id ?? null,
    category_icon_name: category?.icon_name ?? null,
    category_color: category?.color ?? null,
    transaction_at: body.transaction_at,
    note: body.note,
  };
}
