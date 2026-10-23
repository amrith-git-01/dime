import { format } from "date-fns";

import { SIGN_IN_AGAIN_MESSAGE } from "@/lib/outbox/failure";
import { TOO_OLD_MESSAGE } from "@/lib/outbox/outboxPolicy";
import type { OutboxItem } from "@/lib/outbox/outboxTypes";
import { formatInrCompact } from "@/utils/currency";

/** `attention`: something needs the user (failed / blocked); `syncing`: an upload is running; `waiting`: queued. */
export type PendingTone = "syncing" | "waiting" | "attention";

export function pendingTone(
  items: readonly OutboxItem[],
  syncing: boolean,
): PendingTone {
  if (items.some((item) => item.status === "failed" || item.status === "blocked")) {
    return "attention";
  }
  if (syncing || items.some((item) => item.status === "sending")) {
    return "syncing";
  }
  return "waiting";
}

/** "₹250 · Swiggy", "Voice note · 2 Oct, 9:14", "Receipt photo · 2 Oct, 9:14". */
export function describeItem(item: OutboxItem): string {
  if (item.kind === "manual" && item.preview) {
    const name = item.preview.counterparty_name.trim();
    const amount = formatInrCompact(item.preview.amount);
    return name ? `${amount} · ${name}` : amount;
  }
  const when = format(new Date(item.capturedAt), "d MMM, h:mm a");
  return `${item.kind === "voice" ? "Voice note" : "Receipt photo"} · ${when}`;
}

function formatWait(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) {
    return `${seconds} s`;
  }
  return `${Math.ceil(seconds / 60)} min`;
}

/** The status line of one row in the Pending sheet. */
export function describeStatus(
  item: OutboxItem,
  context: { now: number; isOnline: boolean },
): string {
  switch (item.status) {
    case "failed":
      return item.lastError === TOO_OLD_MESSAGE || item.lastError === SIGN_IN_AGAIN_MESSAGE
        ? item.lastError
        : `Couldn't sync: ${item.lastError ?? "something went wrong"}`;
    case "blocked":
      return "Daily limit reached. Retries tomorrow";
    case "sending":
      return "Sending…";
    case "queued":
      if (!context.isOnline) {
        return "Waiting for connection";
      }
      return item.nextAttemptAt !== null && item.nextAttemptAt > context.now
        ? `Retrying in ${formatWait(item.nextAttemptAt - context.now)}`
        : "Waiting to send";
  }
}

/** Accessibility / chip label: "Pending 3", "Pending 1, needs attention". */
export function pendingChipLabel(count: number, tone: PendingTone): string {
  return tone === "attention"
    ? `Pending ${count}, needs attention`
    : tone === "syncing"
      ? `Pending ${count}, syncing`
      : `Pending ${count}, waiting to sync`;
}
