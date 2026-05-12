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
  ],
});
