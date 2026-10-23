import { emptyStateCopy } from "@/components/shared/emptyStateCopy";

import type { PayeeDirection } from "@/features/transactions/utils/payeeKey";

/** Empty-state copy for the transactions list, by what it was filtered on. */
export function resolveListEmptyCopy(
  filter: "day" | "category" | "payee",
  usesRange: boolean,
  direction: PayeeDirection,
) {
  if (filter === "day") {
    return emptyStateCopy.transactionsListDay;
  }
  if (filter === "category") {
    return usesRange
      ? emptyStateCopy.transactionsListCategoryRange
      : emptyStateCopy.transactionsListCategory;
  }
  if (direction === "credit") {
    return usesRange
      ? emptyStateCopy.transactionsListPayerRange
      : emptyStateCopy.transactionsListPayer;
  }
  return usesRange
    ? emptyStateCopy.transactionsListPayeeRange
    : emptyStateCopy.transactionsListPayee;
}
