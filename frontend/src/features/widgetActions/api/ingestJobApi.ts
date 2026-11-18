import { dimeApi } from "@/lib/api/dimeApi";

/** `needs_review`: the capture was read but posted nothing because it needs the user (a foreign-currency amount). */
export type IngestJobStatus = "pending" | "processing" | "done" | "failed" | "needs_review";

/** The transaction a finished capture created (or, for a duplicate payment, the one that already existed). */
export type IngestJobTransaction = {
  id: string;
  /** Decimal string such as `"250.00"`. */
  amount: string;
  type: "debit" | "credit";
  counterparty_name: string | null;
  category: string | null;
};

export type IngestJob = {
  status: IngestJobStatus;
  /** Only on a `done` job whose transaction still exists. */
  transaction?: IngestJobTransaction;
  /** `needs_review` only: why (`foreign_currency`), the currency code read ("USD"), the amount read, and the payee. */
  reason?: string;
  currency?: string | null;
  amount?: string | number | null;
  counterparty_name?: string | null;
};

/**
 * Sent on every poll: tells the server this client understands `needs_review`. Without it the server answers a
 * job that needs the user with the legacy `failed` shape.
 */
export const INGEST_CLIENT_CAPS_HEADER = "X-Dime-Client-Caps";
export const INGEST_CLIENT_CAPS = "review";

/** Where a receipt / voice capture stands. 404 for an unknown job or another user's. */
export async function fetchIngestJob(
  jobId: string,
  options: { timeout?: number; signal?: AbortSignal } = {},
): Promise<IngestJob> {
  const { data } = await dimeApi.get<IngestJob>(
    `/api/v1/ingest/jobs/${encodeURIComponent(jobId)}`,
    {
      headers: { [INGEST_CLIENT_CAPS_HEADER]: INGEST_CLIENT_CAPS },
      ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );
  return data;
}
