import type { DimeSupabaseClient } from '../../core/supabase';
import type { CategoryContext } from '../ai/service';

/**
 * Categories the AI may choose from: system ones plus the user's own, ordered by name, de-duplicated
 * case-insensitively (port of `load_category_options`). With none at all the model gets just "Other".
 */
export async function loadCategoryContext(db: DimeSupabaseClient, userId: string): Promise<CategoryContext> {
  const { data } = await db
    .from('categories')
    .select('id,name')
    .or(`is_system.eq.true,user_id.eq.${userId}`)
    .order('name', { ascending: true })
    .throwOnError()
    .overrideTypes<{ id: unknown; name: unknown }[], { merge: false }>();

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
