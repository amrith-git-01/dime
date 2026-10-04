import * as z from 'zod';

import { decimalInput } from '../../core/decimal';

export const budgetUpsertSchema = z
  .object({
    monthly_amount: decimalInput().nullish(),
    daily_amount: decimalInput().nullish(),
  })
  .superRefine((body, ctx) => {
    if (body.monthly_amount == null && body.daily_amount == null) {
      ctx.addIssue({ code: 'custom', message: 'At least one of monthly_amount or daily_amount is required.' });
    }
  });
export type BudgetUpsertBody = z.infer<typeof budgetUpsertSchema>;

export const categoryBudgetUpsertSchema = z.object({ monthly_amount: decimalInput({ positive: true }) });

export const BUDGET_COLUMNS = 'id,user_id,monthly_budget,daily_budget,created_at,updated_at';

export interface BudgetRow {
  id: string;
  user_id: string;
  monthly_budget: number | string;
  daily_budget: number | string;
  created_at: string;
  updated_at: string;
}

export interface BudgetResponse {
  id: string;
  user_id: string;
  monthly_budget: string;
  daily_budget: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryBudgetItem {
  category_id: string;
  monthly_amount: string;
}
