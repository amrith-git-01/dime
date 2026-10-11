/**
 * The "context file" of the SQL agent: what the model may query and how. It is part of the static
 * system prompt (so it stays in the prefix cache) and holds nothing per user. Keep it in step with the
 * views `sql-guard.ts` builds: a column listed here must exist there, and the other way round.
 */
export const SCHEMA_CONTEXT = `## Your data (SQLite)
You query ONE user's data with SELECT statements through run_sql. Only the five tables below exist; they already contain only the signed-in user's rows (deleted rows are gone), so never filter by user. Nothing else can be read. Notes, receipts and voice files are not available.

### Conventions
- Direction: type = 'debit' is spending (money out), type = 'credit' is income (money in). "Spent" means debit.
- Amounts are RUPEES as REAL numbers (e.g. 1234.5 means ₹1,234.50), already converted. Never divide by 100. Use ROUND(x, 2) on sums and averages.
- Dates: ALWAYS use local_date (TEXT 'YYYY-MM-DD' in the user's timezone) and local_at (TEXT 'YYYY-MM-DD HH:MM:SS' local). transaction_at is UTC: do not filter on it. The NOW block gives today's date and ready-made ranges.
- A range "from A to B inclusive" is local_date >= 'A' AND local_date <= 'B'. A month is a prefix: substr(local_date, 1, 7) = '2026-06'.
- Weekday: CAST(strftime('%w', local_date) AS INTEGER), 0 = Sunday .. 6 = Saturday. Month: substr(local_date, 1, 7). Hour: CAST(strftime('%H', local_at) AS INTEGER).
- Payees: group by payee_key (a normalised key: "SWIGGY" and "Swiggy" share one). Show a name with MIN(counterparty_name). counterparty_name can be NULL (show 'Unknown').
- Categories: system categories are shared by everyone, the user may add their own. transactions.category_id can be NULL (uncategorized): use LEFT JOIN and COALESCE(c.name, 'Uncategorized').
- SQLite dialect: no ILIKE (LIKE is case-insensitive for ASCII), no DATE_TRUNC, no FILTER; use CASE WHEN inside SUM, strftime(), date(), substr(). Results are capped at 200 rows (you see the first 50): aggregate in SQL, add ORDER BY and LIMIT.
- Joins: aggregate first or join on unique keys, or a join will count rows twice. Use COUNT(DISTINCT ...) when unsure.

### transactions
One row per money movement.
- id TEXT: unique id.
- type TEXT: 'debit' (spending) or 'credit' (income).
- amount REAL: rupees, always positive.
- local_date TEXT: 'YYYY-MM-DD', user's timezone. local_at TEXT: 'YYYY-MM-DD HH:MM:SS', user's timezone.
- transaction_at TEXT: ISO-8601 UTC instant (use local_* instead).
- category_id TEXT: -> categories.id, may be NULL.
- counterparty_name TEXT: merchant or person as written, may be NULL.
- counterparty_type TEXT: 'merchant', 'person', 'self_transfer' or 'unknown'.
- payee_key TEXT: normalised payee, use it to group and filter by payee.
- detected_via TEXT: how it was captured: 'manual', 'sms', 'voice', 'scan', 'notification'.
- recurring_item_id TEXT: -> recurring_items.id when created from a subscription or salary item, else NULL.

### categories
- id TEXT, name TEXT (e.g. 'Food & Dining'), is_system INTEGER (1 = shared system category, 0 = the user's own).

### budgets
At most one row: the user's overall budgets.
- monthly_budget REAL: rupees per calendar month. daily_budget REAL: rupees per day, may be NULL.

### category_budgets
- category_id TEXT -> categories.id, monthly_amount REAL: rupees per calendar month for that category.

### recurring_items
Subscriptions (kind 'subscription', money out) and recurring income such as salary (kind 'income').
- id TEXT, kind TEXT, name TEXT, amount REAL (rupees per occurrence), category_id TEXT -> categories.id (may be NULL).
- cadence TEXT: 'monthly' or 'yearly'. day_of_month INTEGER 1-31. month_of_year INTEGER 1-12 (yearly only, else NULL).
- next_due_date TEXT 'YYYY-MM-DD'. active INTEGER: 1 = running, 0 = paused or ended.

### Example queries
Total spent and earned in a month:
SELECT ROUND(SUM(CASE WHEN type = 'debit' THEN amount END), 2) AS spent, ROUND(SUM(CASE WHEN type = 'credit' THEN amount END), 2) AS income, COUNT(*) AS transactions FROM transactions WHERE substr(local_date, 1, 7) = '2026-06'

Spending by category with names (share of the total):
SELECT COALESCE(c.name, 'Uncategorized') AS category, ROUND(SUM(t.amount), 2) AS total, COUNT(*) AS n, ROUND(100.0 * SUM(t.amount) / (SELECT SUM(amount) FROM transactions WHERE type = 'debit' AND local_date BETWEEN '2026-06-01' AND '2026-06-30'), 1) AS share_pct FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE t.type = 'debit' AND t.local_date BETWEEN '2026-06-01' AND '2026-06-30' GROUP BY t.category_id ORDER BY total DESC LIMIT 10

Top payees:
SELECT MIN(counterparty_name) AS payee, payee_key, ROUND(SUM(amount), 2) AS total, COUNT(*) AS n FROM transactions WHERE type = 'debit' AND local_date BETWEEN '2026-06-01' AND '2026-06-30' GROUP BY payee_key ORDER BY total DESC LIMIT 5

Budget versus spent this month, per category:
SELECT c.name AS category, cb.monthly_amount AS budget, ROUND(COALESCE(SUM(t.amount), 0), 2) AS spent, ROUND(cb.monthly_amount - COALESCE(SUM(t.amount), 0), 2) AS remaining FROM category_budgets cb JOIN categories c ON c.id = cb.category_id LEFT JOIN transactions t ON t.category_id = cb.category_id AND t.type = 'debit' AND substr(t.local_date, 1, 7) = '2026-10' GROUP BY cb.category_id ORDER BY spent * 1.0 / cb.monthly_amount DESC

Average spending per weekday (0 = Sunday):
SELECT CAST(strftime('%w', local_date) AS INTEGER) AS weekday, ROUND(SUM(amount), 2) AS total, COUNT(*) AS n, ROUND(AVG(amount), 2) AS avg_per_transaction FROM transactions WHERE type = 'debit' AND local_date BETWEEN '2026-04-01' AND '2026-09-30' GROUP BY weekday ORDER BY weekday`;
