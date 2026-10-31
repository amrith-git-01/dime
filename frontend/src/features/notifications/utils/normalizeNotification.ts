import type { AppNotification, NotificationAction, NotificationKind } from "../types";

const KNOWN_KINDS: ReadonlySet<string> = new Set<NotificationKind>([
  "transaction_auto",
  "budget_threshold",
  "capture_failed",
  "report_ready",
  "reminder_due",
]);

/** A kind this build knows, else `unknown`: the row then shows the server's own title and body. */
export function normalizeNotificationKind(kind: unknown): NotificationKind {
  return typeof kind === "string" && KNOWN_KINDS.has(kind)
    ? (kind as NotificationKind)
    : "unknown";
}

function normalizeAction(action: unknown): NotificationAction {
  const value = action as Partial<NotificationAction> | null | undefined;
  switch (value?.type) {
    case "home":
    case "manual_add":
      return { type: value.type };
    case "transaction_detail":
      return typeof value.transactionId === "string" && value.transactionId
        ? { type: "transaction_detail", transactionId: value.transactionId }
        : { type: "none" };
    case "report":
      return typeof value.periodKey === "string" && value.periodKey
        ? { type: "report", periodKey: value.periodKey }
        : { type: "none" };
    case "reminder":
      return {
        type: "reminder",
        reminderId:
          typeof value.reminderId === "string" && value.reminderId
            ? value.reminderId
            : null,
      };
    default:
      return { type: "none" };
  }
}

/**
 * Re-validates a notification that was stored on the device (inbox snapshot): a row written by a
 * newer build, or a damaged one, must never reach the UI with a kind or action it cannot handle.
 */
export function normalizeNotification(raw: AppNotification): AppNotification {
  return {
    ...raw,
    kind: normalizeNotificationKind(raw.kind),
    title: typeof raw.title === "string" ? raw.title : "",
    body: typeof raw.body === "string" ? raw.body : "",
    action: normalizeAction(raw.action),
  };
}
