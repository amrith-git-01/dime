from __future__ import annotations

SCHEMA_VERSION = "2026-06-12"

ALLOWED_TABLES: frozenset[str] = frozenset({
    "transactions",
    "categories",
    "budgets",
    "category_budgets",
    "users"
})

SCHEMA_DOC = f"""
    # Dime finance schema (version {SCHEMA_VERSION})
    # Currency: INR. Use transaction_at (timestamptz) for date filters.
    # Active rows only: transactions.deleted_at IS NULL unless user asks about deleted.
    ## transactions
    - id (uuid PK)
    - user_id (uuid FK → users.id)          -- RLS scopes to logged-in user
    - amount (numeric)                       -- always positive
    - type (text)                            -- 'debit' | 'credit'
    - counterparty_name (text)               -- payee / merchant display name
    - counterparty_normalized (text)         -- normalized payee for grouping
    - counterparty_type (text)               -- merchant | person | self_transfer | unknown
    - category_id (uuid FK → categories.id, nullable)
    - note (text, nullable)
    - detected_via (text, nullable)          -- manual | sms | voice | scan | notification
    - transaction_at (timestamptz)           -- when the spend happened
    - created_at, updated_at (timestamptz)
    - deleted_at (timestamptz, nullable)     -- soft delete; filter IS NULL
    ## categories
    - id (uuid PK)
    - user_id (uuid FK, nullable)            -- NULL = system default category
    - name (text)
    - emoji, color (text)
    - is_system (boolean)
    - created_at (timestamptz)
    ## budgets
    - id (uuid PK)
    - user_id (uuid FK)
    - monthly_budget, daily_budget (numeric)
    - created_at, updated_at (timestamptz)
    ## category_budgets
    - id (uuid PK)
    - user_id (uuid FK)
    - category_id (uuid FK → categories.id)
    - monthly_amount (numeric)
    - created_at, updated_at (timestamptz)
    ## users
    - id (uuid PK, same as auth.users)
    - currency (text, default INR)
    - budget_reset_day (int)
    ## Common joins
    - transactions.category_id = categories.id
    - category_budgets.category_id = categories.id
    - budgets.user_id = users.id
    ## Example patterns
    -- Total debit spend in March 2026:
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM transactions
    WHERE type = 'debit'
    AND deleted_at IS NULL
    AND transaction_at >= '2026-03-01'
    AND transaction_at < '2026-04-01';
    -- Spend by category:
    SELECT c.name, SUM(t.amount) AS total
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.type = 'debit' AND t.deleted_at IS NULL
    GROUP BY c.name
    ORDER BY total DESC;
    """.strip()

def get_schema_doc() -> str:
    return SCHEMA_DOC

def list_tables_summary() -> str:
    lines = [f"- {t}" for t in sorted(ALLOWED_TABLES)]
    return "Allowed tables:\n"+"\n".join(lines)