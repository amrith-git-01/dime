import { emptyStateCopy } from "@/components/shared/emptyStateCopy";

import type { MonthListKind } from "@/features/transactions/utils/monthListFilter";
import type { PayeeDirection } from "@/features/transactions/utils/payeeKey";

/** Empty-state copy for the transactions list, by what it was filtered on. */
export function resolveListEmptyCopy(
  filter: "day" | "category" | "payee" | "month",
  usesRange: boolean,
  direction: PayeeDirection,
  monthKind: MonthListKind | "filtered" = "all",
) {
  if (filter === "month") {
    switch (monthKind) {
      case "recurring":
        return emptyStateCopy.transactionsListMonthRecurring;
      case "flexible":
        return emptyStateCopy.transactionsListMonthFlexible;
      case "income":
        return emptyStateCopy.transactionsListMonthIncome;
      case "filtered":
        return emptyStateCopy.transactionsListMonthFiltered;
      default:
        return emptyStateCopy.transactionsListMonth;
    }
  }
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
