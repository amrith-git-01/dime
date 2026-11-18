import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { recurringQueryKeys } from "@/features/recurring/queryKeys";
import type { RecurringListResponse } from "@/features/recurring/types";
import { useLinkRecurringMutation } from "@/features/recurring/hooks/useRecurringMutations";
import { useToast } from "@/features/toast/useToast";
import { useSessionUserId } from "@/hooks/useSessionUserId";

import type { PostedManualTransaction } from "../api/submitTransactionApi";
import type { TransactionRow } from "../types";
import { kindOf } from "../utils/transactionKind";
import { useDeleteTransactionMutation } from "./useDeleteTransactionMutation";

/** What a saved manual entry offers next, in the order it is worth asking. */
export type ManualSaveHint =
  | { kind: "duplicate"; row: TransactionRow }
  | { kind: "recurring"; row: TransactionRow; itemId: string; occurrence: string }
  | { kind: "payback"; row: TransactionRow };

/**
 * The one hint a saved entry deserves: a possible duplicate first (the add already went through; Undo deletes it),
 * then "is this your <item> bill?", then, for money received from a person, "paying you back for something?".
 * Only one is shown, so the save toast is not buried under a queue of questions.
 */
export function pickManualSaveHint(posted: PostedManualTransaction): ManualSaveHint | null {
  const row = posted.transaction;
  if (!row || posted.created === false) {
    return null;
  }
  if (posted.possibleDuplicateOf) {
    return { kind: "duplicate", row };
  }
  if (posted.possibleRecurring) {
    return {
      kind: "recurring",
      row,
      itemId: posted.possibleRecurring.itemId,
      occurrence: posted.possibleRecurring.occurrence,
    };
  }
  if (kindOf(row) === "income" && row.counterparty_type === "person") {
    return { kind: "payback", row };
  }
  return null;
}

/**
 * After a manual entry is saved: shows the one follow-up question it deserves (see `pickManualSaveHint`).
 * `onOpenPaidBack` opens the saved credit with its "Paid back" picker (the screen decides how to navigate).
 */
export function useManualSaveFollowUps(options: { onOpenPaidBack: (row: TransactionRow) => void }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();
  const deleteMutation = useDeleteTransactionMutation();
  const linkRecurring = useLinkRecurringMutation();
  const { onOpenPaidBack } = options;

  const itemNameOf = useCallback(
    (itemId: string): string | null => {
      const lists = queryClient.getQueriesData<RecurringListResponse>({
        queryKey: [...recurringQueryKeys.all, "list", userId ?? "none"],
      });
      for (const [, list] of lists) {
        const match = list?.items.find((item) => item.id === itemId);
        if (match) {
          return match.name;
        }
      }
      return null;
    },
    [queryClient, userId],
  );

  return useCallback(
    (posted: PostedManualTransaction): boolean => {
      const hint = pickManualSaveHint(posted);
      if (!hint) {
        return false;
      }
      switch (hint.kind) {
        case "duplicate":
          showToast({
            variant: "warning",
            message: "Looks like a duplicate",
            action: {
              label: "Undo",
              onPress: () => {
                deleteMutation
                  .mutateAsync({ id: hint.row.id, expectedUpdatedAt: hint.row.updated_at, row: hint.row })
                  .then(() => showToast({ variant: "success", message: "Removed the duplicate" }))
                  .catch(() => showToast({ variant: "error", message: "Could not remove it. Delete it from the list." }));
              },
            },
          });
          return true;
        case "recurring": {
          const name = itemNameOf(hint.itemId);
          showToast({
            variant: "info",
            message: name ? `Is this your ${name} bill?` : "Is this one of your recurring bills?",
            action: {
              label: "Yes, link",
              onPress: () => {
                linkRecurring
                  .mutateAsync({
                    itemId: hint.itemId,
                    transactionId: hint.row.id,
                    occurrence: hint.occurrence,
                  })
                  .then(() => showToast({ variant: "success", message: "Linked to your recurring bill" }))
                  .catch(() => showToast({ variant: "error", message: "Could not link it. Try again from Budgets." }));
              },
            },
          });
          return true;
        }
        case "payback":
          showToast({
            variant: "info",
            message: "Paying you back for something?",
            action: { label: "Link", onPress: () => onOpenPaidBack(hint.row) },
          });
          return true;
      }
    },
    [deleteMutation, itemNameOf, linkRecurring, onOpenPaidBack, showToast],
  );
}
