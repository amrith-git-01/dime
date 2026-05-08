import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

import { Category } from "./models/Category";
import { schema } from "./schema";

const adapter = new SQLiteAdapter({
  schema,
  dbName: "dime.db",
  jsi: true,
  onSetUpError: (error) => {
    console.error("[WatermelonDB] setup failed:", error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Category],
});
