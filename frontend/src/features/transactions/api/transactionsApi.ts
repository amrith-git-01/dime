import { dimeApi } from "@/lib/api/dimeApi";
import { monthRangeIso } from "@/utils/dates";

import type { CounterpartyType } from "../counterpartyTypes";
import type {
  HomeOverview,
  MonthSummary,
  TransactionKind,
  TransactionListPage,
  TransactionRow,
  TransactionType,
} from "../types";

export { monthRangeIso };

export type CreateTransactionBody = {
  /** Decimal string such as `"250.50"` (C6). */
  amount: string;
  type: TransactionType;
  counterparty_name: string;
  counterparty_type: CounterpartyType;
  /** How the row counts. Omitted = the server derives it from the direction and the counterparty. */
  kind?: TransactionKind;
  category: string | null;
  category_id?: string | null;
  /** A brand picked from the catalogue; null for a typed name (the server matches known names itself). */
  brand_id?: string | null;
  note: string | null;
  /** ISO-8601 datetime string */
  transaction_at: string;
  detected_via?: string | null;
};

const TX_PAGE_LIMIT = 50;

/** Server-side list filters (C3). */
export type TransactionListFilters = {
  /** Case-insensitive "contains" match on the payee. */
  payee?: string;
  categoryId?: string;
  /** Only the transactions this recurring item posted (its whole history). */
  recurringItemId?: string;
};

export async function fetchTransactionsPage(input: {
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
  timezone?: string;
  filters?: TransactionListFilters;
}): Promise<TransactionListPage> {
  const { data } = await dimeApi.get<TransactionListPage>(
    "/api/v1/transactions",
    {
      params: {
        from: input.from ?? undefined,
        to: input.to ?? undefined,
        limit: input.limit ?? TX_PAGE_LIMIT,
        offset: input.offset ?? 0,
        timezone: input.timezone ?? undefined,
        payee: input.filters?.payee || undefined,
        category_id: input.filters?.categoryId || undefined,
        recurring_item_id: input.filters?.recurringItemId || undefined,
      },
    },
  );
  return data;
}

/** Single transaction with fresh signed media URLs (C7). */
export async function fetchTransactionById(
  id: string,
): Promise<TransactionRow> {
  const { data } = await dimeApi.get<TransactionRow>(
    `/api/v1/transactions/${id}`,
  );
  return data;
}

export async function fetchHomeOverview(
  timezone: string,
): Promise<HomeOverview> {
  const { data } = await dimeApi.get<HomeOverview>(
    "/api/v1/transactions/home",
    {
      params: { timezone },
    },
  );
  return data;
}

export async function fetchMonthSummary(input: {
  year: number;
  month: number;
  timezone: string;
}): Promise<MonthSummary> {
  const { data } = await dimeApi.get<MonthSummary>(
    "/api/v1/transactions/month-summary",
    {
      params: {
        year: input.year,
        month: input.month,
        timezone: input.timezone,
      },
    },
  );
  return data;
}

export { TX_PAGE_LIMIT };

/**
 * PATCH changes only the fields sent. `expected_updated_at` is the `updated_at` the client last saw: a row that
 * changed elsewhere meanwhile answers 409 `{code: "stale"}` instead of being overwritten.
 */
export type UpdateTransactionBody = Partial<Omit<CreateTransactionBody, "detected_via">> & {
  expected_updated_at?: string;
};

/** Per-call options of a write sent from the outbox (or with a short timeout). */
export type TransactionWriteOptions = {
  timeout?: number;
  signal?: AbortSignal;
  /** Outbox only: the user it belongs to (refused when someone else is signed in). */
  outboxUserId?: string;
};

function writeConfig(options?: TransactionWriteOptions) {
  return {
    ...(options?.timeout !== undefined ? { timeout: options.timeout } : {}),
    ...(options?.signal ? { signal: options.signal } : {}),
    ...(options?.outboxUserId ? { _outboxUserId: options.outboxUserId } : {}),
  };
}

/** The server answers with the full saved row (fresh signed media URLs included). */
export async function updateTransaction(
  id: string,
  body: UpdateTransactionBody,
  options?: TransactionWriteOptions,
): Promise<TransactionRow | undefined> {
  const { data } = await dimeApi.patch<TransactionRow | undefined>(
    `/api/v1/transactions/${id}`,
    body,
    writeConfig(options),
  );
  return data && typeof data.id === "string" ? data : undefined;
}

/** `expectedUpdatedAt` guards the delete the same way: a row changed elsewhere meanwhile is a 409 `stale`. */
export async function deleteTransaction(
  id: string,
  options?: TransactionWriteOptions & { expectedUpdatedAt?: string | null },
): Promise<void> {
  await dimeApi.delete(`/api/v1/transactions/${id}`, {
    ...writeConfig(options),
    ...(options?.expectedUpdatedAt
      ? { params: { expected_updated_at: options.expectedUpdatedAt } }
      : {}),
  });
}

/** The app's undo of a delete: the row comes back with its paybacks. Answers the restored row. */
export async function restoreTransaction(
  id: string,
  options?: TransactionWriteOptions,
): Promise<TransactionRow | undefined> {
  const { data } = await dimeApi.post<TransactionRow | undefined>(
    `/api/v1/transactions/${id}/restore`,
    {},
    writeConfig(options),
  );
  return data && typeof data.id === "string" ? data : undefined;
}
