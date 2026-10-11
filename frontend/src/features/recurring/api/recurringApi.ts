import { dimeApi } from "@/lib/api/dimeApi";

import type {
  CreateRecurringBody,
  RecurringItem,
  RecurringKind,
  RecurringListResponse,
  UpdateRecurringBody,
} from "../types";

const PATH = "/api/v1/recurring";

export async function fetchRecurring(
  kind: RecurringKind,
): Promise<RecurringListResponse> {
  const { data } = await dimeApi.get<RecurringListResponse>(PATH, {
    params: { kind },
  });
  return data;
}

export async function createRecurring(
  body: CreateRecurringBody,
): Promise<RecurringItem> {
  const { data } = await dimeApi.post<RecurringItem>(PATH, body);
  return data;
}

export async function updateRecurring(
  id: string,
  body: UpdateRecurringBody,
): Promise<RecurringItem> {
  const { data } = await dimeApi.patch<RecurringItem>(`${PATH}/${id}`, body);
  return data;
}

export async function deleteRecurring(id: string): Promise<void> {
  await dimeApi.delete(`${PATH}/${id}`);
}
