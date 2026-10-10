import { dimeApi } from "@/lib/api/dimeApi";
import { monthRangeIso } from "@/utils/dates";

import type { CounterpartyType } from "../counterpartyTypes";
import type {
  HomeOverview,
  MonthSummary,
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
  category: string | null;
  category_id?: string | null;
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

export type UpdateTransactionBody = Omit<CreateTransactionBody, "detected_via">;

export async function updateTransaction(
  id: string,
  body: UpdateTransactionBody,
): Promise<void> {
  await dimeApi.patch(`/api/v1/transactions/${id}`, body);
}

export async function deleteTransaction(id: string): Promise<void> {
  await dimeApi.delete(`/api/v1/transactions/${id}`);
}
