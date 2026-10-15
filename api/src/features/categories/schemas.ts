import * as z from 'zod';

import { decimalInput } from '../../core/decimal';

export const MAX_CUSTOM_CATEGORIES_PER_USER = 15;
export const DEFAULT_CUSTOM_ICON = 'Tag';
export const DEFAULT_CUSTOM_COLOR = '#94A3B8';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(40),
  icon_name: z.string().max(64).nullish(),
  color: z.string().max(16).nullish(),
});
export type CreateCategoryBody = z.infer<typeof createCategorySchema>;

/**
 * C1 partial update. `budget_amount` has three states, told apart with `hasBudgetChange`:
 * absent = untouched, `null` = remove the budget, decimal >= 0 (<= 10 whole digits, 2 places) = upsert.
 */
export const updateCategorySchema = z
  .object({
    name: z.string().min(1).max(40).nullish(),
    icon_name: z.string().max(64).nullish(),
    color: z.string().max(16).nullish(),
    budget_amount: decimalInput({ maxWholeDigits: 10, maxDecimalPlaces: 2 }).nullable().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.name == null && body.icon_name == null && body.color == null && !hasBudgetChange(body)) {
      ctx.addIssue({ code: 'custom', message: 'Nothing to update.' });
    }
  });
export type UpdateCategoryBody = z.infer<typeof updateCategorySchema>;

export function hasBudgetChange(body: object): boolean {
  return Object.hasOwn(body, 'budget_amount');
}

/**
 * Where a category is used: `spend` for ordinary transactions and category budgets, the `recurring_*` scopes only for
 * recurring expense / income items.
 */
export const CATEGORY_SCOPES = ['spend', 'recurring_expense', 'recurring_income'] as const;
export type CategoryScope = (typeof CATEGORY_SCOPES)[number];

/** `GET /categories?scope=`: defaults to `spend`, so older app builds never see the recurring categories. */
export const listQuerySchema = z.object({ scope: z.enum(CATEGORY_SCOPES).default('spend') });

export const deleteQuerySchema = z.object({ reassign_to_category_id: z.string().max(64).optional() });

export interface CategoryRow {
  id: string;
  user_id: string | null;
  name: string;
  icon_name: string;
  color: string;
  is_system: boolean;
  created_at: string;
  scope: CategoryScope;
}

export const CATEGORY_COLUMNS = 'id,user_id,name,icon_name,color,is_system,created_at,scope';

export interface CategoryResponse {
  id: string;
  name: string;
  icon_name: string;
  color: string;
  is_system: boolean;
  scope: CategoryScope;
  created_at: string;
  user_id: string | null;
  /** Populated by PATCH only: the category's monthly budget after the update. */
  budget_amount: string | null;
}
