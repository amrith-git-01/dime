import type { CategoryRow } from "@/features/categories/types";

import { database } from "./database";
import { Category } from "./models/Category";
import { UserCategory } from "./models/UserCategory";

function systemCollection() {
  return database.get<Category>("categories");
}

function userCollection() {
  return database.get<UserCategory>("user_categories");
}

function toEpochMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Date.now();
}

function applySystemRow(
  record: Category,
  row: CategoryRow,
  isCreate: boolean,
): void {
  record.name = row.name;
  record.iconName = row.icon_name;
  record.color = row.color;
  record.isSystem = true;
  record.createdAt = toEpochMs(row.created_at);
  if (isCreate) {
    (record as Category & { _raw: { id: string } })._raw.id = row.id;
  }
}

function applyUserRow(
  record: UserCategory,
  row: CategoryRow,
  isCreate: boolean,
): void {
  record.userId = row.user_id ?? "";
  record.name = row.name;
  record.iconName = row.icon_name;
  record.color = row.color;
  record.createdAt = toEpochMs(row.created_at);
  if (isCreate) {
    (record as UserCategory & { _raw: { id: string } })._raw.id = row.id;
  }
}

export async function upsertCategoriesFromApi(
  rows: CategoryRow[],
): Promise<void> {
  const systemRows = rows.filter((row) => row.is_system);
  const userRows = rows.filter((row) => !row.is_system);

  const systemCol = systemCollection();
  const userCol = userCollection();

  const incomingSystemIds = new Set(systemRows.map((row) => row.id));
  const incomingUserIds = new Set(userRows.map((row) => row.id));

  const existingSystem = await systemCol.query().fetch();
  const existingUser = await userCol.query().fetch();

  const existingSystemById = new Map(
    existingSystem.map((row) => [row.id, row]),
  );
  const existingUserById = new Map(existingUser.map((row) => [row.id, row]));

  await database.write(async () => {
    for (const row of systemRows) {
      const found = existingSystemById.get(row.id);
      if (found) {
        await found.update((record) => {
          applySystemRow(record, row, false);
        });
        continue;
      }
      await systemCol.create((record) => {
        applySystemRow(record, row, true);
      });
    }

    for (const row of userRows) {
      const found = existingUserById.get(row.id);
      if (found) {
        await found.update((record) => {
          applyUserRow(record, row, false);
        });
        continue;
      }
      await userCol.create((record) => {
        applyUserRow(record, row, true);
      });
    }

    for (const row of existingSystem) {
      if (!incomingSystemIds.has(row.id)) {
        await row.destroyPermanently();
      }
    }

    for (const row of existingUser) {
      if (!incomingUserIds.has(row.id)) {
        await row.destroyPermanently();
      }
    }
  });
}

export async function upsertCategoryFromApi(row: CategoryRow): Promise<void> {
  if (row.is_system) {
    const col = systemCollection();
    const found = await col.find(row.id).catch(() => null);
    await database.write(async () => {
      if (found) {
        await found.update((record) => {
          applySystemRow(record, row, false);
        });
        return;
      }
      await col.create((record) => {
        applySystemRow(record, row, true);
      });
    });
    return;
  }

  const col = userCollection();
  const found = await col.find(row.id).catch(() => null);
  await database.write(async () => {
    if (found) {
      await found.update((record) => {
        applyUserRow(record, row, false);
      });
      return;
    }
    await col.create((record) => {
      applyUserRow(record, row, true);
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
  const [systemRows, userRows] = await Promise.all([
    systemCollection().query().fetch(),
    userCollection().query().fetch(),
  ]);

  const mapped: LocalCategoryRecord[] = [
    ...systemRows.map((row) => ({
      id: row.id,
      name: row.name,
      icon_name: row.iconName,
      color: row.color,
      is_system: true,
      created_at: new Date(row.createdAt).toISOString(),
      user_id: null,
    })),
    ...userRows.map((row) => ({
      id: row.id,
      name: row.name,
      icon_name: row.iconName,
      color: row.color,
      is_system: false,
      created_at: new Date(row.createdAt).toISOString(),
      user_id: row.userId,
    })),
  ];

  return mapped.sort((a, b) => {
    if (a.is_system !== b.is_system) {
      return a.is_system ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}
