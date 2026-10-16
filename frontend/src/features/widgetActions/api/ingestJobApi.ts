import { dimeApi } from "@/lib/api/dimeApi";

export type IngestJobStatus = "pending" | "processing" | "done" | "failed";

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
};

/** Where a receipt / voice capture stands. 404 for an unknown job or another user's. */
export async function fetchIngestJob(
  jobId: string,
  options: { timeout?: number; signal?: AbortSignal } = {},
): Promise<IngestJob> {
  const { data } = await dimeApi.get<IngestJob>(
    `/api/v1/ingest/jobs/${encodeURIComponent(jobId)}`,
    {
      ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    },
  );
  return data;
}
