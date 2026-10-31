import type { QueryClient } from "@tanstack/react-query";

import { REMINDER_LIST_STALE_MS } from "@/lib/queryDefaults";
import { useToastUiStore } from "@/stores/toastUiStore";

import { completeReminder, fetchReminders } from "../api/remindersApi";
import { invalidateReminderQueries } from "../cache/invalidateReminderQueries";
import { reminderQueryKeys } from "../queryKeys";
import type { Reminder } from "../types";

/** The open reminder whose "looks paid" suggestion is this transaction, if any. */
export function findSettleMatch(
  reminders: readonly Reminder[],
  transactionId: string,
): Reminder | null {
  return (
    reminders.find(
      (reminder) =>
        reminder.status === "open" &&
        reminder.suggested_match?.transaction_id === transactionId,
    ) ?? null
  );
}

/** What the "Settle" toast says. */
export function settleMessage(reminder: Reminder): string {
  return reminder.direction === "receive"
    ? `Looks like this is for "${reminder.title}". Mark it received?`
    : `Looks like this pays "${reminder.title}". Mark it paid?`;
}

/** Reminders being settled right now: a second press on the toast must not post /complete twice. */
const settling = new Set<string>();

/** Completes the reminder with the transaction that paid it, then says how it went. */
async function settle(
  queryClient: QueryClient,
  reminder: Reminder,
  transactionId: string,
): Promise<void> {
  if (settling.has(reminder.id)) {
    return;
  }
  settling.add(reminder.id);
  try {
    await completeReminder(reminder.id, transactionId);
    useToastUiStore.getState().show({
      variant: "success",
      message: reminder.direction === "receive" ? "Marked received" : "Marked paid",
    });
  } catch {
    useToastUiStore
      .getState()
      .show({ variant: "error", message: "Couldn't update the reminder. Try again from Reminders." });
  } finally {
    settling.delete(reminder.id);
    invalidateReminderQueries(queryClient);
  }
}

/**
 * After a manual add: if an open reminder now "looks paid" by exactly this transaction, offers to settle
 * it with a toast. Fire and forget: it asks the server (the suggestion is computed there), never
 * throws, and never delays or fails the add. Reminders live in memory only, so an empty or unknown
 * cache simply means "ask"; the one shortcut is a list fetched moments ago that was empty.
 *
 * The toast host closes the toast itself when its action is pressed, so nothing here dismisses it
 * (a second dismissal would also drop the next queued toast).
 */
export async function offerSettleForTransaction(
  queryClient: QueryClient,
  userId: string | undefined,
  transactionId: string,
): Promise<void> {
  try {
    if (!userId) {
      return;
    }
    const key = reminderQueryKeys.list(userId, "open");
    const cached = queryClient.getQueryData<Reminder[]>(key);
    const fetchedAt = queryClient.getQueryState(key)?.dataUpdatedAt ?? 0;
    if (cached && cached.length === 0 && Date.now() - fetchedAt < REMINDER_LIST_STALE_MS) {
      return;
    }
    const reminders = await queryClient.fetchQuery({
      queryKey: key,
      queryFn: () => fetchReminders("open"),
      staleTime: 0,
    });
    const match = findSettleMatch(reminders, transactionId);
    if (!match) {
      return;
    }
    useToastUiStore.getState().show({
      variant: "info",
      message: settleMessage(match),
      action: {
        label: "Settle",
        onPress: () => void settle(queryClient, match, transactionId),
      },
    });
  } catch {
    // The add already succeeded; a missing offer costs nothing.
  }
}
