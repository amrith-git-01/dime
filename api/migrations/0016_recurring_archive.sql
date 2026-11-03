-- Deleting a recurring item now archives it, so its posted transactions keep a live `recurring_item_id` and the app can still
-- show their history (GET /transactions?recurring_item_id=...). An archived item is hidden everywhere: it is not listed, not in
-- the month view, not posted, not reminded and not in the agent's SQL views. The service also sets it inactive with no reminder
-- instant, so the cron queries (which filter on active) skip it even before they check `archived_at`.
ALTER TABLE recurring_items ADD COLUMN archived_at TEXT;
