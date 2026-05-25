import { appSchema, tableSchema } from "@nozbe/watermelondb";

export const schema = appSchema({
  version: 4,
  tables: [
    tableSchema({
      name: "categories",
      columns: [
        { name: "name", type: "string" },
        { name: "icon_name", type: "string" },
        { name: "color", type: "string" },
        { name: "is_system", type: "boolean" },
        { name: "created_at", type: "number" },
      ],
    }),
    tableSchema({
      name: "user_categories",
      columns: [
        { name: "user_id", type: "string" },
        { name: "name", type: "string" },
        { name: "icon_name", type: "string" },
        { name: "color", type: "string" },
        { name: "created_at", type: "number" },
      ],
    }),
  ],
});
