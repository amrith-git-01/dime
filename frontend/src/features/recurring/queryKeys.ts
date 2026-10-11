import type { RecurringKind } from "./types";

export const recurringQueryKeys = {
  all: ["recurring"] as const,
  list: (userId: string | undefined, kind: RecurringKind) =>
    [...recurringQueryKeys.all, "list", userId ?? "none", kind] as const,
};
