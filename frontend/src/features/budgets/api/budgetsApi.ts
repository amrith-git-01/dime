import { dimeApi } from "@/lib/api/dimeApi";

export type BudgetResponse = {
  id: string;
  user_id: string;
  monthly_budget: string; // decimal as string
  daily_budget: string; // decimal as string
  created_at: string;
  updated_at: string;
};

export type BudgetGetResponse = {
  budget: BudgetResponse | null;
};

export async function fetchBudget(): Promise<BudgetGetResponse> {
  const { data } = await dimeApi.get<BudgetGetResponse>("/api/v1/budget");
  return data;
}

export async function upsertBudget(input: { amount: number }) {
  const { data } = await dimeApi.patch<BudgetResponse>("/api/v1/budget", { amount: input.amount });
  return data;
}
