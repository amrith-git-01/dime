import * as z from 'zod';

import { decimalInput } from '../../core/decimal';

// There is no daily budget any more. `budgets.daily_budget` and `user_settings.budget_daily_*` are unused leftovers,
// kept in the database so the CI migrate-then-deploy window cannot break a running Worker; drop them in a later migration.
// Old app builds may still send `daily_amount`: it is accepted and ignored.
export const budgetUpsertSchema = z.object({
  monthly_amount: decimalInput(),
  daily_amount: decimalInput().nullish(),
});
export type BudgetUpsertBody = z.infer<typeof budgetUpsertSchema>;

export const categoryBudgetUpsertSchema = z.object({ monthly_amount: decimalInput({ positive: true }) });

export const BUDGET_COLUMNS = 'id,user_id,monthly_budget,created_at,updated_at';

export interface BudgetRow {
  id: string;
  user_id: string;
  monthly_budget: number | string;
  created_at: string;
  updated_at: string;
}

export interface BudgetResponse {
  id: string;
  user_id: string;
  monthly_budget: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryBudgetItem {
  category_id: string;
  monthly_amount: string;
}
