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
  amount: number;
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

export async function fetchTransactionsPage(input: {
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}): Promise<TransactionListPage> {
  const { data } = await dimeApi.get<TransactionListPage>(
    "/api/v1/transactions",
    {
      params: {
        from: input.from ?? undefined,
        to: input.to ?? undefined,
        limit: input.limit ?? TX_PAGE_LIMIT,
        offset: input.offset ?? 0,
      },
    },
  );
  return data;
}

/** @deprecated Prefer fetchTransactionsPage — kept for any legacy callers expecting a flat list. */
export async function fetchTransactions(): Promise<TransactionRow[]> {
  const page = await fetchTransactionsPage({
    limit: 100,
    offset: 0,
  });
  return page.items;
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
