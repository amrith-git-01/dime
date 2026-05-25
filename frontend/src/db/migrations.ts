import {
  schemaMigrations,
  unsafeExecuteSql,
} from "@nozbe/watermelondb/Schema/migrations";

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        unsafeExecuteSql(
          "ALTER TABLE categories RENAME COLUMN emoji TO icon_name;",
        ),
      ],
    },
    {
      toVersion: 3,
      steps: [
        unsafeExecuteSql("ALTER TABLE categories ADD COLUMN user_id TEXT;"),
      ],
    },
    {
      toVersion: 4,
      steps: [
        unsafeExecuteSql(
          `CREATE TABLE IF NOT EXISTS user_categories (
            id TEXT PRIMARY KEY NOT NULL,
            _status TEXT,
            _changed TEXT,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            icon_name TEXT NOT NULL,
            color TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );`,
        ),
        unsafeExecuteSql("ALTER TABLE categories DROP COLUMN user_id;"),
      ],
    },
  ],
});
