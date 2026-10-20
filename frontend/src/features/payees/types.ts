import type { CounterpartyType } from "@/features/transactions/counterpartyTypes";

export type PayeeCategory = {
  id: string;
  name: string;
  icon_name: string | null;
  color: string | null;
};

/** One row of the shared brand catalogue (`GET /api/v1/brands/search`). `domain` is kept for logos later. */
export type BrandSuggestion = {
  id: string;
  name: string;
  domain: string | null;
  logo_url: string | null;
  category: PayeeCategory | null;
};

/** One of the user's own payees of one transaction type (`GET /api/v1/payees/suggestions`). */
export type PayeeSuggestion = {
  name: string;
  brand_id: string | null;
  domain: string | null;
  counterparty_type: CounterpartyType;
  category: PayeeCategory | null;
  count: number;
  last_at: string;
};

/** What picking a payee or brand in the counterparty search box fills into the form. */
export type CounterpartySelection = {
  name: string;
  brandId: string | null;
  counterpartyType: CounterpartyType;
  /** Category to preselect when the form has none yet. */
  category: { id: string; name: string } | null;
};
