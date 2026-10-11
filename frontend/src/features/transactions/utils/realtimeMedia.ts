import type { TransactionRow } from "../types";

function isSignedUrl(value: string | null | undefined): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function reconcileMediaField(
  incoming: string | null,
  existing: string | null | undefined,
): string | null {
  if (incoming === null) {
    return null;
  }
  if (isSignedUrl(incoming)) {
    return incoming;
  }
  // Realtime payloads carry the raw storage object path (C7), which is not loadable.
  // Keep the cached signed URL if there is one; otherwise drop it, and the detail screen
  // refetches a fresh signed URL when the transaction is opened.
  return isSignedUrl(existing) ? existing : null;
}

/** Applies a realtime row without ever replacing a signed media URL with a raw storage path. */
export function reconcileRealtimeMedia(
  incoming: TransactionRow,
  existing: TransactionRow | null | undefined,
): TransactionRow {
  const receipt_url = reconcileMediaField(
    incoming.receipt_url,
    existing?.receipt_url,
  );
  const voice_url = reconcileMediaField(incoming.voice_url, existing?.voice_url);
  if (
    receipt_url === incoming.receipt_url &&
    voice_url === incoming.voice_url
  ) {
    return incoming;
  }
  return { ...incoming, receipt_url, voice_url };
}
