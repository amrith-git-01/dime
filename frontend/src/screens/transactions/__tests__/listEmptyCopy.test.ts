import { emptyStateCopy } from "@/components/shared/emptyStateCopy";

import { resolveListEmptyCopy } from "../listEmptyCopy";

describe("resolveListEmptyCopy", () => {
  it("talks about debits for a payee list", () => {
    expect(resolveListEmptyCopy("payee", false, "debit")).toBe(
      emptyStateCopy.transactionsListPayee,
    );
    expect(resolveListEmptyCopy("payee", true, "debit")).toBe(
      emptyStateCopy.transactionsListPayeeRange,
    );
  });

  it("talks about credits for a payer list", () => {
    expect(resolveListEmptyCopy("payee", false, "credit")).toBe(
      emptyStateCopy.transactionsListPayer,
    );
    expect(resolveListEmptyCopy("payee", true, "credit").subtext).toContain(
      "credits",
    );
  });

  it("ignores the direction for day and category lists", () => {
    expect(resolveListEmptyCopy("day", false, "credit")).toBe(
      emptyStateCopy.transactionsListDay,
    );
    expect(resolveListEmptyCopy("category", true, "credit")).toBe(
      emptyStateCopy.transactionsListCategoryRange,
    );
  });
});
