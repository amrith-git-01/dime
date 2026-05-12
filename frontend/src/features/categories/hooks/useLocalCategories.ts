import { useEffect, useState } from "react";

import { listLocalCategories } from "@/db/categoriesRepo";
import { database } from "@/db/database";
import { Category } from "@/db/models/Category";

export type LocalCategory = {
  id: string;
  name: string;
  icon_name: string;
  color: string;
  is_system: boolean;
  created_at: string;
};

function mapCategory(row: Category): LocalCategory {
  return {
    id: row.id,
    name: row.name,
    icon_name: row.iconName,
    color: row.color,
    is_system: row.isSystem,
    created_at: new Date(row.createdAt).toISOString(),
  };
}

export function useLocalCategories() {
  const [data, setData] = useState<LocalCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const rows = await listLocalCategories();
      if (!cancelled) {
        setData(rows.map(mapCategory));
        setLoading(false);
      }
    };

    void load();

    const sub = database
      .get<Category>("categories")
      .query()
      .observe()
      .subscribe((rows) => {
        if (cancelled) {
          return;
        }
        const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
        setData(sorted.map(mapCategory));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, []);

  return { data, loading };
}
