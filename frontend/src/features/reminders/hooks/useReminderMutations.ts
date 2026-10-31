import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { askNotificationsInContext } from "@/features/onboarding/utils/askNotificationsInContext";
import { useSessionUserId } from "@/hooks/useSessionUserId";

import {
  completeReminder,
  createReminder,
  deleteReminder,
  skipReminder,
  updateReminder,
} from "../api/remindersApi";
import { invalidateReminderQueries } from "../cache/invalidateReminderQueries";
import { reminderQueryKeys } from "../queryKeys";
import type { CreateReminderBody, Reminder, UpdateReminderBody } from "../types";
import { isRepeating } from "../constants";

export function useCreateReminderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReminderBody) => createReminder(body),
    onSuccess: () => {
      void askNotificationsInContext(
        "Get a reminder before a payment is due.",
        qc,
      );
      invalidateReminderQueries(qc);
    },
  });
}

export function useUpdateReminderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateReminderBody }) =>
      updateReminder(id, body),
    onSuccess: () => invalidateReminderQueries(qc),
  });
}

type OptimisticContext = { previous: Reminder[] | undefined };

/** Takes a reminder off the cached open list at once; the returned context puts it back on failure. */
async function removeFromOpenList(
  qc: QueryClient,
  userId: string | undefined,
  id: string,
): Promise<OptimisticContext> {
  const key = reminderQueryKeys.list(userId, "open");
  await qc.cancelQueries({ queryKey: key });
  const previous = qc.getQueryData<Reminder[]>(key);
  if (previous) {
    qc.setQueryData<Reminder[]>(
      key,
      previous.filter((reminder) => reminder.id !== id),
    );
  }
  return { previous };
}

function restoreOpenList(
  qc: QueryClient,
  userId: string | undefined,
  context: OptimisticContext | undefined,
): void {
  if (context?.previous) {
    qc.setQueryData(reminderQueryKeys.list(userId, "open"), context.previous);
  }
}

/** Deleting leaves the list at once; a failure puts the row back. */
export function useDeleteReminderMutation() {
  const qc = useQueryClient();
  const { userId } = useSessionUserId();
  return useMutation<void, unknown, string, OptimisticContext>({
    mutationFn: (id) => deleteReminder(id),
    onMutate: (id) => removeFromOpenList(qc, userId, id),
    onError: (_error, _id, context) => restoreOpenList(qc, userId, context),
    onSettled: () => invalidateReminderQueries(qc),
  });
}

export type CompleteReminderVariables = {
  reminder: Pick<Reminder, "id" | "cadence">;
  /** The transaction that paid it ("Looks paid" or the settle toast). */
  transactionId?: string;
};

/**
 * Marks a reminder paid. A one-off leaves the open list at once; a repeating one stays (it moves
 * to its next date on the server), so only the refetch changes it.
 */
export function useCompleteReminderMutation() {
  const qc = useQueryClient();
  const { userId } = useSessionUserId();
  return useMutation<Reminder | null, unknown, CompleteReminderVariables, OptimisticContext>({
    mutationFn: ({ reminder, transactionId }) => completeReminder(reminder.id, transactionId),
    onMutate: ({ reminder }) =>
      isRepeating(reminder.cadence)
        ? Promise.resolve({ previous: undefined })
        : removeFromOpenList(qc, userId, reminder.id),
    onError: (_error, _variables, context) => restoreOpenList(qc, userId, context),
    onSettled: () => invalidateReminderQueries(qc),
  });
}

export function useSkipReminderMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => skipReminder(id),
    onSuccess: () => invalidateReminderQueries(qc),
  });
}
