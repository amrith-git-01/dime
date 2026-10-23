import { classifyFailure } from "./failure";

export type SendOrQueueResult<T> =
  | { status: "sent"; value: T }
  | { status: "queued" };

/**
 * The decision every offline-capable write goes through: offline -> queue now; online -> send, and
 * if the server could not be reached (or answered 5xx / 429 / 409 "processing") queue it with the
 * same idempotency key. Anything the server refused for good (validation, the daily limit) is
 * rethrown, so each screen keeps its own error UX for it.
 */
export async function sendOrQueue<T>(args: {
  isOnline: () => boolean;
  send: () => Promise<T>;
  queue: () => Promise<void> | void;
}): Promise<SendOrQueueResult<T>> {
  if (!args.isOnline()) {
    await args.queue();
    return { status: "queued" };
  }
  try {
    return { status: "sent", value: await args.send() };
  } catch (error) {
    if (classifyFailure(error).kind === "retry") {
      await args.queue();
      return { status: "queued" };
    }
    throw error;
  }
}
