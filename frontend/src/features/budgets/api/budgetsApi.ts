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

export type UpsertBudgetInput = {
  monthlyAmount?: number;
  dailyAmount?: number;
};

export async function fetchBudget(): Promise<BudgetGetResponse> {
  const { data } = await dimeApi.get<BudgetGetResponse>("/api/v1/budget");
  return data;
}

export async function upsertBudget(input: UpsertBudgetInput) {
  const body: Record<string, number> = {};
  if (input.monthlyAmount !== undefined) {
    body.monthly_amount = input.monthlyAmount;
  }
  if (input.dailyAmount !== undefined) {
    body.daily_amount = input.dailyAmount;
  }
  const { data } = await dimeApi.patch<BudgetResponse>("/api/v1/budget", body);
  return data;
}
