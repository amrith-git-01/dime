import { Q } from "@nozbe/watermelondb";

import type { CategoryRow } from "@/features/categories/types";

import { database } from "./database";
import { Category } from "./models/Category";

function collection() {
  return database.get<Category>("categories");
}

function toEpochMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
}

export async function upsertCategoriesFromApi(rows: CategoryRow[]): Promise<void> {
  const col = collection();
  const incomingIds = new Set(rows.map((row) => row.id));
  const existing = await col.query().fetch();
  const existingById = new Map(existing.map((row) => [row.id, row]));

  await database.write(async () => {
    for (const row of rows) {
      const found = existingById.get(row.id);
      if (found) {
        await found.update((record) => {
          record.name = row.name;
          record.emoji = row.emoji;
          record.color = row.color;
          record.isSystem = row.is_system;
          record.createdAt = toEpochMs(row.created_at);
        });
        continue;
      }

      await col.create((record) => {
        (record as Category & { _raw: { id: string } })._raw.id = row.id;
        record.name = row.name;
        record.emoji = row.emoji;
        record.color = row.color;
        record.isSystem = row.is_system;
        record.createdAt = toEpochMs(row.created_at);
      });
    }

    for (const row of existing) {
      if (!incomingIds.has(row.id)) {
        await row.destroyPermanently();
      }
    }
  });
}

export async function listLocalCategories(): Promise<Category[]> {
  const col = collection();
  return col.query(Q.sortBy("name", Q.asc)).fetch();
}
