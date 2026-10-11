-- Worker-issued sign-in (phase 2). Replaces Supabase Auth.
--   auth_identities  who a Google (or future provider) subject is in Dime
--   auth_sessions    one row per refresh token; the token itself is never stored, only its SHA-256 hex.
--                    Rotation revokes the row (revoked_at, replaced_by) and starts a new one in the same family_id.

CREATE TABLE auth_identities (
  provider    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (provider, subject)
);
CREATE INDEX auth_identities_user_idx ON auth_identities (user_id);

CREATE TABLE auth_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  refresh_hash  TEXT NOT NULL UNIQUE,
  family_id     TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT,
  replaced_by   TEXT
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_family_idx ON auth_sessions (family_id);
