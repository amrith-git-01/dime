-- Separate system categories for recurring items, and clean-up after removing the daily budget.
--
-- categories.scope: 'spend' is every category a person picks for a normal transaction (all existing rows, including
-- the system "Income" category that manual credit transactions use). 'recurring_expense' and 'recurring_income' are
-- only for subscriptions / recurring income items; the API hides them from the default list and rejects them on
-- ordinary transactions and category budgets. Transactions posted by a recurring item carry the item's category.
ALTER TABLE categories ADD COLUMN scope TEXT NOT NULL DEFAULT 'spend'
  CHECK (scope IN ('spend', 'recurring_expense', 'recurring_income'));

INSERT INTO categories (id, name, icon_name, color, is_system, created_at, user_id, scope) VALUES
  ('94b82777-eee4-46de-8c18-7490bda02b60', 'Rent',                'House',         '#38BDF8', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_expense'),
  ('5ff58423-93ee-4a03-8163-54e99032ca7a', 'Subscriptions',       'Repeat',        '#A78BFA', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_expense'),
  ('18102b0b-d5fa-4cfc-a206-5292332054a1', 'Utilities',           'Zap',           '#FACC15', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_expense'),
  ('2f223b6a-f43d-4acb-ae01-a458fea3ef3e', 'Internet & phone',    'Wifi',          '#22D3EE', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_expense'),
  ('12e84868-996c-40de-8d1c-9255fb91aeda', 'EMI & loans',         'Landmark',      '#F87171', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_expense'),
  ('0dd0f591-b647-4abf-9b2f-ff55ecc5bd9a', 'Insurance',           'Shield',        '#2DD4BF', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_expense'),
  ('4882de9d-bc2a-4131-b3a0-d21e493dff55', 'Investments & SIP',  'TrendingUp',    '#4ADE80', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_expense'),
  ('e010a80d-feaf-4ea4-b551-56b3fbf32825', 'Fees & tuition',      'GraduationCap', '#F472B6', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_expense'),
  ('6158972c-10bc-4104-8e72-b7ccfc439bf7', 'Other expense',       'Package',       '#94A3B8', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_expense'),
  ('f48bfe4a-8f08-4229-b977-e1292b11490f', 'Salary',              'Briefcase',     '#34D399', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_income'),
  ('5f046bf7-6fa4-449e-991a-fef31b30d60e', 'Freelance',           'Laptop',        '#2DD4BF', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_income'),
  ('b4a019cd-2bb2-494a-940a-5d99909c771f', 'Rental income',       'Building',      '#60A5FA', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_income'),
  ('00579994-1e12-486a-9623-f8a50cfa70cb', 'Interest & dividends', 'PiggyBank',    '#A3E635', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_income'),
  ('aeb86570-fd1f-4a87-b98c-51398e889313', 'Allowance',           'Gift',          '#FB7185', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_income'),
  ('51f46a0c-7b63-46c4-92fd-54fdae387da0', 'Other income',        'CirclePlus',    '#94A3B8', 1, '2026-10-14T00:00:00.000Z', NULL, 'recurring_income');

-- Move existing recurring items onto the new categories (the old ones were ordinary spend categories).
-- Income items -> Salary. Subscriptions -> the closest recurring category, else "Other expense".
UPDATE recurring_items
SET category_id = (SELECT id FROM categories WHERE is_system = 1 AND scope = 'recurring_income' AND name = 'Salary')
WHERE kind = 'income';

UPDATE recurring_items
SET category_id = (
  SELECT id FROM categories
  WHERE is_system = 1 AND scope = 'recurring_expense'
    AND name = CASE (SELECT c.name FROM categories c WHERE c.id = recurring_items.category_id)
                 WHEN 'Bills & Utilities' THEN 'Utilities'
                 WHEN 'Education'         THEN 'Fees & tuition'
                 WHEN 'Entertainment'     THEN 'Subscriptions'
                 ELSE 'Other expense'
               END
)
WHERE kind = 'subscription';

-- Transactions already posted by those items follow the item's new category, so history, insights and the items agree.
UPDATE transactions
SET category_id = (SELECT r.category_id FROM recurring_items r WHERE r.id = transactions.recurring_item_id),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE recurring_item_id IS NOT NULL
  AND category_id IS NOT (SELECT r.category_id FROM recurring_items r WHERE r.id = transactions.recurring_item_id);

-- The daily budget is gone: drop its notifications. `budgets.daily_budget` and `user_settings.budget_daily_*` are unused
-- now and are removed in a later migration (not here, so a CI migrate-then-deploy window cannot break a running Worker).
DELETE FROM notifications WHERE dedupe_key LIKE 'budget:daily:%';
