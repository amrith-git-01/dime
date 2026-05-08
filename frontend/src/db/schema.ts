import { appSchema, tableSchema } from "@nozbe/watermelondb";

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: "categories",
      columns: [
        { name: "name", type: "string" },
        { name: "emoji", type: "string" },
        { name: "color", type: "string" },
        { name: "is_system", type: "boolean" },
        { name: "created_at", type: "number" },
      ],
    }),
  ],
});
