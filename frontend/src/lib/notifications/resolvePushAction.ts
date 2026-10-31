import { isReportPeriodKey } from "@/features/brokeReport/utils/periodKey";

/** `data` of a push as the backend sends it; extra fields are allowed. */
export type NotificationActionData = {
  action_type?: string;
  action_transaction_id?: string;
  /** `YYYY-MM`, with `action_type: "report"`. */
  period_key?: string;
  /** With `action_type: "reminder"`; absent for a recurring item's lead reminder. */
  reminder_id?: string;
  // Allow additional backend fields without tightening the type.
  [key: string]: unknown;
};

export type PushActionTarget =
  | { type: "manual_add" }
  | { type: "report"; periodKey: string }
  /** `reminderId` null opens the Reminders list without a highlight. */
  | { type: "reminder"; reminderId: string | null }
  | { type: "transaction"; transactionId: string }
  | { type: "inbox" };

/** Where a tapped push should lead; anything it cannot place falls back to the inbox. */
export function resolvePushAction(
  data: NotificationActionData | undefined,
): PushActionTarget {
  if (data?.action_type === "manual_add") {
    return { type: "manual_add" };
  }
  if (
    data?.action_type === "report" &&
    isReportPeriodKey(data.period_key)
  ) {
    return { type: "report", periodKey: data.period_key };
  }
  if (data?.action_type === "reminder") {
    // Checked before the transaction fallback: the push also carries an (empty) transaction id.
    return {
      type: "reminder",
      reminderId:
        typeof data.reminder_id === "string" && data.reminder_id
          ? data.reminder_id
          : null,
    };
  }
  if (typeof data?.action_transaction_id === "string") {
    return { type: "transaction", transactionId: data.action_transaction_id };
  }
  return { type: "inbox" };
}
