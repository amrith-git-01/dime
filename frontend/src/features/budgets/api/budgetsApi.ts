import { dimeApi } from "@/lib/api/dimeApi";

export type BudgetResponse = {
  id: string;
  user_id: string;
  monthly_budget: string; // decimal as string
  created_at: string;
  updated_at: string;
};

export type BudgetGetResponse = {
  budget: BudgetResponse | null;
};

export type UpsertBudgetInput = {
  monthlyAmount?: number;
};

export async function fetchBudget(): Promise<BudgetGetResponse> {
  const { data } = await dimeApi.get<BudgetGetResponse>("/api/v1/budget");
  return data;
}

export async function upsertBudget(input: UpsertBudgetInput) {
  // Amounts travel as decimal strings (C6).
  const body: Record<string, string> = {};
  if (input.monthlyAmount !== undefined) {
    body.monthly_amount = input.monthlyAmount.toFixed(2);
  }
  const { data } = await dimeApi.patch<BudgetResponse>("/api/v1/budget", body);
  return data;
}
