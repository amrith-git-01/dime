import { dimeApi } from "@/lib/api/dimeApi";

import type { BrandSuggestion, PayeeSuggestion } from "../types";
import type { TransactionType } from "@/features/transactions/types";

export async function searchBrands(
  q: string,
  limit: number,
): Promise<BrandSuggestion[]> {
  const { data } = await dimeApi.get<{ items: BrandSuggestion[] }>(
    "/api/v1/brands/search",
    { params: { q, limit } },
  );
  return data.items;
}

/** The type is required: expense and income payee lists are separate. */
export async function fetchPayeeSuggestions(
  type: TransactionType,
  q: string | undefined,
  limit: number,
): Promise<PayeeSuggestion[]> {
  const { data } = await dimeApi.get<{ items: PayeeSuggestion[] }>(
    "/api/v1/payees/suggestions",
    { params: { type, limit, ...(q ? { q } : {}) } },
  );
  return data.items;
}
