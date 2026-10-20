-- Brand catalogue for the counterparty search box: public reference data, never user data.
-- Built by a script from open sources (Wikidata, CC0; OSM Name Suggestion Index, BSD-3) plus manual fixes.
-- Each user's "your payees" list is derived from their own transactions (brand_id / payee_key), not stored here.

CREATE TABLE brands (
  id           TEXT PRIMARY KEY,                     -- 'wd:Q65944364', 'nsi:<id>' or 'dime:<slug>'
  name         TEXT NOT NULL,                        -- display name: 'Swiggy'
  domain       TEXT,                                 -- 'swiggy.com'; the app draws the logo from it (Brandfetch Logo API)
  logo_url     TEXT,                                 -- optional override when the domain has no usable logo
  category_id  TEXT REFERENCES categories (id) ON DELETE SET NULL, -- default system spend category
  country      TEXT,                                 -- 'IN' for India-only brands, NULL for global ones
  popularity   INTEGER NOT NULL DEFAULT 0,           -- ranking signal (Wikidata sitelink count); higher sorts first
  source       TEXT NOT NULL CHECK (source IN ('wikidata', 'nsi', 'manual')),
  wikidata_id  TEXT,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX brands_domain_idx ON brands (domain);

-- Exact spellings that resolve to one brand, normalised like transactions.payee_key
-- (dedupe.ts normalizeCounterparty): 'swiggy', 'swiggy instamart', 'bundl technologies', 'swiggy icici'.
-- Used to link captured receipts / SMS / typed names to a brand. The brand's own name is listed too.
CREATE TABLE brand_aliases (
  alias     TEXT PRIMARY KEY,
  brand_id  TEXT NOT NULL REFERENCES brands (id) ON DELETE CASCADE
);
CREATE INDEX brand_aliases_brand_idx ON brand_aliases (brand_id);

-- Prefix search for the search box ("bli" -> Blinkit). Rewritten by the catalogue script with the brands rows.
CREATE VIRTUAL TABLE brands_fts USING fts5(
  brand_id UNINDEXED,
  name,
  aliases,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '1 2 3'
);

-- Links a transaction to the brand it was paid to / received from, so a user's history groups across spellings
-- ('SWIGGY*BLR', 'Swiggy') and lists can show the logo. NULL for people, local shops and unmatched names.
ALTER TABLE transactions ADD COLUMN brand_id TEXT REFERENCES brands (id) ON DELETE SET NULL;
CREATE INDEX transactions_user_brand_idx ON transactions (user_id, type, brand_id) WHERE deleted_at IS NULL;
