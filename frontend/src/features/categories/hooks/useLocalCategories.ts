import { useEffect, useState } from "react";

import {
  listLocalCategories,
  type LocalCategoryRecord,
} from "@/db/categoriesRepo";
import { database } from "@/db/database";
import { Category } from "@/db/models/Category";

export type LocalCategory = LocalCategoryRecord;

function sortCategories(rows: LocalCategory[]): LocalCategory[] {
  return [...rows].sort((a, b) => {
    if (a.is_system !== b.is_system) {
      return a.is_system ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

export function useLocalCategories() {
  const [data, setData] = useState<LocalCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const rows = await listLocalCategories();
      if (!cancelled) {
        setData(rows);
        setLoading(false);
      }
    };

    void load();

    const sub = database
      .get<Category>("categories")
      .query()
      .observe()
      .subscribe(() => {
        void load();
      });

    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, []);

  return { data: sortCategories(data), loading };
}
