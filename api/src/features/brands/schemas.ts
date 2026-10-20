import * as z from 'zod';

const limitParam = z.coerce.number().int().min(1).max(20).default(8);

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(60),
  limit: limitParam,
});

export const suggestionsQuerySchema = z.object({
  /** Expense and income payees are separate lists, so the type is required. */
  type: z.enum(['debit', 'credit']),
  q: z.string().trim().max(60).optional(),
  limit: limitParam,
});

export interface CategoryRef {
  id: string;
  name: string;
  icon_name: string | null;
  color: string | null;
}

export interface BrandItem {
  id: string;
  name: string;
  domain: string | null;
  logo_url: string | null;
  category: CategoryRef | null;
}

export interface PayeeSuggestion {
  name: string;
  brand_id: string | null;
  domain: string | null;
  counterparty_type: 'merchant' | 'person' | 'self_transfer' | 'unknown';
  category: CategoryRef | null;
  count: number;
  last_at: string;
}
