import { appSchema, tableSchema } from "@nozbe/watermelondb";

export const schema = appSchema({
  version: 5,
  tables: [
    tableSchema({
      name: "categories",
      columns: [
        { name: "name", type: "string" },
        { name: "icon_name", type: "string" },
        { name: "color", type: "string" },
        { name: "is_system", type: "boolean" },
        { name: "user_id", type: "string", isOptional: true },
        { name: "created_at", type: "number" },
      ],
    }),
  ],
});
