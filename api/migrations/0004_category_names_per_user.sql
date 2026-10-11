-- Category names are unique per user (categories_user_name_uniq, kept), not across all users.
-- A custom name must still not clash with a system category name: the categories service checks that
-- against the visible list (system + own) and answers 409.
DROP INDEX categories_name_uniq;
