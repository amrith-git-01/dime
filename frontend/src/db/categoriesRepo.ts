import type { CategoryRow } from "@/features/categories/types";

import { database } from "./database";
import { Category } from "./models/Category";

function categoryCollection() {
  return database.get<Category>("categories");
}

function toEpochMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
}

function applyCategoryRow(
  record: Category,
  row: CategoryRow,
  isCreate: boolean,
): void {
  record.name = row.name;
  record.iconName = row.icon_name;
  record.color = row.color;
  record.isSystem = row.is_system;
  record.userId = row.is_system ? null : (row.user_id ?? null);
  record.createdAt = toEpochMs(row.created_at);
  if (isCreate) {
    (record as Category & { _raw: { id: string } })._raw.id = row.id;
  }
}

export async function upsertCategoriesFromApi(
  rows: CategoryRow[],
): Promise<void> {
  const col = categoryCollection();
  const incomingIds = new Set(rows.map((row) => row.id));
  const existing = await col.query().fetch();
  const existingById = new Map(existing.map((row) => [row.id, row]));

  await database.write(async () => {
    for (const row of rows) {
      const found = existingById.get(row.id);
      if (found) {
        await found.update((record) => {
          applyCategoryRow(record, row, false);
        });
        continue;
      }
      await col.create((record) => {
        applyCategoryRow(record, row, true);
      });
    }

    for (const row of existing) {
      if (!incomingIds.has(row.id)) {
        await row.destroyPermanently();
      }
    }
  });
}

export async function upsertCategoryFromApi(row: CategoryRow): Promise<void> {
  const col = categoryCollection();
  const found = await col.find(row.id).catch(() => null);
  await database.write(async () => {
    if (found) {
      await found.update((record) => {
        applyCategoryRow(record, row, false);
      });
      return;
    }
    await col.create((record) => {
      applyCategoryRow(record, row, true);
    });
  });
}

export type LocalCategoryRecord = {
  id: string;
  name: string;
  icon_name: string;
  color: string;
  is_system: boolean;
  created_at: string;
  user_id: string | null;
};

export async function listLocalCategories(): Promise<LocalCategoryRecord[]> {
  const rows = await categoryCollection().query().fetch();

  const mapped: LocalCategoryRecord[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    icon_name: row.iconName,
    color: row.color,
    is_system: row.isSystem,
    created_at: new Date(row.createdAt).toISOString(),
    user_id: row.isSystem ? null : row.userId,
  }));

  return mapped.sort((a, b) => {
    if (a.is_system !== b.is_system) {
      return a.is_system ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
