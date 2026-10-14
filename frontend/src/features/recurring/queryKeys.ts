import type { RecurringKind } from "./types";

export const recurringQueryKeys = {
  all: ["recurring"] as const,
  list: (userId: string | undefined, kind: RecurringKind) =>
    [...recurringQueryKeys.all, "list", userId ?? "none", kind] as const,
  /** One calendar month's occurrences; `monthIndex0` is 0-11 like the other month keys. */
  month: (userId: string | undefined, year: number, monthIndex0: number) =>
    [...recurringQueryKeys.all, "month", userId ?? "none", year, monthIndex0] as const,
};
