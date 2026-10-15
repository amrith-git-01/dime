import { all } from '../../core/db';
import type { Db } from '../../core/db';
import type { CategoryContext } from '../ai/service';

/**
 * Categories the AI may choose from: system ones plus the user's own, ordered by name, de-duplicated
 * case-insensitively (port of `load_category_options`). With none at all the model gets just "Other".
 */
export async function loadCategoryContext(db: Db, userId: string): Promise<CategoryContext> {
  const data = await all<{ id: unknown; name: unknown }>(
    db,
    "SELECT id, name FROM categories WHERE (is_system = 1 OR user_id = ?) AND scope = 'spend' ORDER BY name COLLATE NOCASE ASC, name ASC",
    [userId],
  );

  const seen = new Set<string>();
  const options: { id: string; name: string }[] = [];
  for (const row of data) {
    if (typeof row.id !== 'string' || typeof row.name !== 'string') continue;
    const name = row.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ id: row.id, name });
  }
  if (options.length === 0) return { allowedCategories: ['Other'], categoryOptions: [{ id: '', name: 'Other' }] };
  return { allowedCategories: options.map((o) => o.name), categoryOptions: options };
}
