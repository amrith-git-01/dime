import { emptyStateCopy } from "@/components/shared/emptyStateCopy";

import type { MonthListKind } from "@/features/transactions/utils/monthListFilter";
import type { PayeeDirection } from "@/features/transactions/utils/payeeKey";

/** Empty-state copy for the transactions list, by what it was filtered on. */
export function resolveListEmptyCopy(
  filter: "day" | "category" | "payee" | "month" | "recurring",
  usesRange: boolean,
  direction: PayeeDirection,
  monthKind: MonthListKind | "filtered" = "all",
  /** The recurring item's name, for its empty list. */
  recurringName = "",
) {
  if (filter === "recurring") {
    return {
      headline: recurringName
        ? `No payments recorded for ${recurringName} yet`
        : "No payments recorded yet",
      subtext: "Payments show up here once this recurring item has posted.",
    };
  }
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
