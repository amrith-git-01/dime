/**
 * Where a category is used. `spend` is for ordinary transactions and category budgets; the recurring scopes
 * are only for the category of a subscription / recurring income item.
 */
export type CategoryScope = "spend" | "recurring_expense" | "recurring_income";

export type CategoryRow = {
  id: string;
  name: string;
  icon_name: string;
  color: string;
  is_system: boolean;
  scope?: CategoryScope;
  created_at: string;
  user_id?: string | null;
};

export type CreateCategoryPayload = {
  name: string;
  icon_name?: string;
  color?: string;
};
