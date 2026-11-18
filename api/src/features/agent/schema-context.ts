/**
 * The "context file" of the SQL agent: what the model may query and how. It is part of the static
 * system prompt (so it stays in the prefix cache) and holds nothing per user. Keep it in step with the
 * views `sql-guard.ts` builds: a column listed here must exist there, and the other way round.
 */
export const SCHEMA_CONTEXT = `## Your data (SQLite)
You query ONE user's data with SELECT statements through run_sql. Only the five tables below exist; they already contain only the signed-in user's rows (deleted rows are gone), so never filter by user. Nothing else can be read. Notes, receipts and voice files are not available.

### Conventions
- How a row counts is its kind: 'spend' (money out), 'income' (money in), 'transfer' (own-account moves, ATM cash, credit-card bill payments: NOT spending and NOT income) and 'payback' (a refund or reimbursement that gives money back for a spend). type ('debit' / 'credit') is only the direction.
- "Spent" is SUM(spend_amount): it is already net of paybacks and leaves out transfers and income. "Income" is SUM(income_amount): the part of money received that is not linked to a spend (Mom sends 5000, 3000 pays back the hotel: 2000 is income). If SUM(spend_amount) over a range is below zero (more refunds than spending), the spent figure is 0. Never add up amount for spending or income, and never count transfers or paybacks as income or spending.
- Budget: the monthly budget is measured against SUM(spend_amount) WHERE counts_toward_budget = 1 (everyday spending plus recurring items the user opted in). Spending with counts_toward_budget = 0 is "committed" (rent, EMI, insurance) and sits outside the budget.
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
- type TEXT: 'debit' (money out) or 'credit' (money in).
- kind TEXT: 'spend', 'income', 'transfer' or 'payback' (see Conventions).
- amount REAL: rupees, always positive: the full amount of the movement.
- effective_amount REAL: amount minus the paybacks linked to it: what a spend really cost, or the part of a credit (income or payback) not yet linked to a spend. Equals amount for transfers.
- spend_amount REAL: this row's contribution to spending, net of paybacks (a spend: effective_amount; an unlinked refund: minus its effective_amount; income and transfers: 0). SUM(spend_amount) over any range is the spent figure.
- income_amount REAL: this row's contribution to income (an income credit: effective_amount; everything else: 0). SUM(income_amount) over any range is the income figure.
- local_date TEXT: 'YYYY-MM-DD', user's timezone. local_at TEXT: 'YYYY-MM-DD HH:MM:SS', user's timezone.
- transaction_at TEXT: ISO-8601 UTC instant (use local_* instead).
- category_id TEXT: -> categories.id, may be NULL.
- counterparty_name TEXT: merchant or person as written, may be NULL.
- counterparty_type TEXT: 'merchant', 'person', 'self_transfer' or 'unknown'.
- payee_key TEXT: normalised payee, use it to group and filter by payee.
- detected_via TEXT: how it was captured: 'manual', 'sms', 'voice', 'scan', 'notification'.
- recurring_item_id TEXT: -> recurring_items.id when created from a subscription or salary item, else NULL.
- counts_toward_budget INTEGER: 1 when the row counts toward the monthly budget (everyday spending, and recurring items that opted in), 0 for committed money (rent, EMI, insurance).

### categories
- id TEXT, name TEXT (e.g. 'Food & Dining'), is_system INTEGER (1 = shared system category, 0 = the user's own).
- scope TEXT: 'spend' for everyday categories (Food & Dining, Transport, ...), 'recurring_expense' for subscription and bill categories (Rent, Subscriptions, Utilities, EMI & loans, ...), 'recurring_income' for salary-type income (Salary, Freelance, ...). Transactions posted from recurring items carry the recurring category.

### budgets
At most one row: the user's overall budgets (the current value).
- monthly_budget REAL: rupees per calendar month. There is no daily budget.

### category_budgets
- category_id TEXT -> categories.id, monthly_amount REAL: rupees per calendar month for that category (the current value).

### recurring_items
Subscriptions (kind 'subscription', money out) and recurring income such as salary (kind 'income').
- id TEXT, kind TEXT, name TEXT, amount REAL (rupees per occurrence), category_id TEXT -> categories.id (may be NULL).
- cadence TEXT: 'monthly' or 'yearly'. day_of_month INTEGER 1-31. month_of_year INTEGER 1-12 (yearly only, else NULL).
- next_due_date TEXT 'YYYY-MM-DD'. active INTEGER: 1 = running, 0 = paused or ended.
- counts_toward_budget INTEGER: 1 when what it posts counts toward the monthly budget.

### Example queries
Total spent and earned in a month:
SELECT ROUND(SUM(spend_amount), 2) AS spent, ROUND(SUM(income_amount), 2) AS income, COUNT(*) AS transactions FROM transactions WHERE substr(local_date, 1, 7) = '2026-06'

Spending by category with names (share of the total; everyday spending only, committed money is left out):
SELECT COALESCE(c.name, 'Uncategorized') AS category, ROUND(SUM(t.spend_amount), 2) AS total, COUNT(*) AS n, ROUND(100.0 * SUM(t.spend_amount) / (SELECT SUM(spend_amount) FROM transactions WHERE counts_toward_budget = 1 AND local_date BETWEEN '2026-06-01' AND '2026-06-30'), 1) AS share_pct FROM transactions t LEFT JOIN categories c ON c.id = t.category_id WHERE t.kind IN ('spend', 'payback') AND t.counts_toward_budget = 1 AND t.local_date BETWEEN '2026-06-01' AND '2026-06-30' GROUP BY t.category_id ORDER BY total DESC LIMIT 10

Top payees:
SELECT MIN(counterparty_name) AS payee, payee_key, ROUND(SUM(spend_amount), 2) AS total, COUNT(*) AS n FROM transactions WHERE kind = 'spend' AND counts_toward_budget = 1 AND local_date BETWEEN '2026-06-01' AND '2026-06-30' GROUP BY payee_key ORDER BY total DESC LIMIT 5

Budget versus spent this month, per category:
SELECT c.name AS category, cb.monthly_amount AS budget, ROUND(COALESCE(SUM(t.spend_amount), 0), 2) AS spent, ROUND(cb.monthly_amount - COALESCE(SUM(t.spend_amount), 0), 2) AS remaining FROM category_budgets cb JOIN categories c ON c.id = cb.category_id LEFT JOIN transactions t ON t.category_id = cb.category_id AND t.counts_toward_budget = 1 AND substr(t.local_date, 1, 7) = '2026-10' GROUP BY cb.category_id ORDER BY spent * 1.0 / cb.monthly_amount DESC

Average spending per weekday (0 = Sunday):
SELECT CAST(strftime('%w', local_date) AS INTEGER) AS weekday, ROUND(SUM(spend_amount), 2) AS total, COUNT(*) AS n, ROUND(AVG(spend_amount), 2) AS avg_per_transaction FROM transactions WHERE kind = 'spend' AND local_date BETWEEN '2026-04-01' AND '2026-09-30' GROUP BY weekday ORDER BY weekday`;
