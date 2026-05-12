import { Database } from "@nozbe/watermelondb";
import SQLiteAdapter from "@nozbe/watermelondb/adapters/sqlite";

import { migrations } from "./migrations";
import { Category } from "./models/Category";
import { schema } from "./schema";
import { isWatermelonJsiAvailable } from "./watermelonJsi";

const jsi = isWatermelonJsiAvailable();

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: "dime.db",
  jsi,
  onSetUpError: (error) => {
    console.error("[WatermelonDB] setup failed:", error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Category],
});
