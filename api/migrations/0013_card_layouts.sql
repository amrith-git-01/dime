-- Per-user order of the cards on Home, Budgets and Insights ("Arrange"): a JSON object like
-- {"home":["home.month",...],"budgets":[...]}. NULL = nobody rearranged anything (every screen keeps its default order).
-- Written through PATCH /me/settings (features/user-settings), merged per screen with json_patch.
ALTER TABLE user_settings ADD COLUMN card_layouts TEXT;
