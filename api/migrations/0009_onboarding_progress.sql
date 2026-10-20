-- "Asked Dime AI" for the Home "Get started" checklist (GET /me/onboarding-progress). agent_usage.turns goes back down when a
-- turn is refunded and its rows are per day, so it cannot say "has this person ever got an answer". This column does: set once,
-- when an agent turn completes successfully (features/agent/usage.ts markFirstAgentQuestion), never cleared.
ALTER TABLE users ADD COLUMN first_agent_question_at TEXT;

-- Existing users: the first day they asked anything (a claimed-and-refunded day has turns = 0 and is skipped).
UPDATE users SET first_agent_question_at = (
  SELECT MIN(agent_usage.day) || 'T00:00:00.000Z' FROM agent_usage WHERE agent_usage.user_id = users.id AND agent_usage.turns > 0
);
