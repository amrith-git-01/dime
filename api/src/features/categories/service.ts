import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UpstreamError,
  ValidationError,
} from '../../core/errors';
import { INSUFFICIENT_PRIVILEGE, NO_DATA_FOUND, WRONG_SCOPE, hasPgCode, isUniqueViolation } from '../../core/db-errors';
import { formatMoney } from '../../core/decimal';
import { log } from '../../core/logging';
import type { Db } from '../../core/db';
import { markEngineDirty } from '../engine/dirty';
import { deleted, inserted, updated } from '../realtime/events';
import type { ChangeEvent, Publish } from '../realtime/events';
import { emit } from '../realtime/publish';
import * as repo from './repository';
import {
  DEFAULT_CUSTOM_COLOR,
  DEFAULT_CUSTOM_ICON,
  MAX_CUSTOM_CATEGORIES_PER_USER,
  hasBudgetChange,
} from './schemas';
import type { CategoryResponse, CategoryRow, CategoryScope, CreateCategoryBody, UpdateCategoryBody } from './schemas';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const DUPLICATE_NAME = 'You already have a category with this name.';
const NOT_FOUND = 'Category not found.';

/** Row -> response; null when the row lacks a required display field (such rows are skipped). */
function rowToResponse(row: Partial<CategoryRow> | null | undefined): CategoryResponse | null {
  if (!row) return null;
  const text = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null);
  const id = text(row.id);
  const name = text(row.name);
  const iconName = text(row.icon_name);
  const color = text(row.color);
  const createdAt = text(row.created_at);
  if (!id || !name || !iconName || !color || !createdAt) return null;
  const isSystem = (row.is_system as unknown) === true || (row.is_system as unknown) === 'true';
  return {
    id,
    name,
    icon_name: iconName,
    color,
    is_system: isSystem,
    scope: row.scope === 'recurring_expense' || row.scope === 'recurring_income' ? row.scope : 'spend',
    created_at: createdAt,
    user_id: isSystem ? null : text(row.user_id),
    budget_amount: null,
  };
}

export async function listCategories(db: Db, userId: string, scope: CategoryScope = 'spend'): Promise<CategoryResponse[]> {
  const rows = await repo.listVisible(db, userId, scope);
  return rows.map(rowToResponse).filter((r): r is CategoryResponse => r !== null);
}

const sameName = (a: unknown, b: string) => typeof a === 'string' && a.trim().toLowerCase() === b.toLowerCase();

export async function createCategory(
  db: Db,
  userId: string,
  body: CreateCategoryBody,
  publish?: Publish,
): Promise<CategoryResponse> {
  const name = body.name.trim();
  if (!name) throw new ValidationError('Category name is required.');

  // One query: the visible list holds the user's custom rows (limit check) and every name (uniqueness).
  const rows = await repo.listVisible(db, userId);
  if (rows.filter((r) => !r.is_system && r.user_id === userId).length >= MAX_CUSTOM_CATEGORIES_PER_USER) {
    throw new BadRequestError(`You can add up to ${MAX_CUSTOM_CATEGORIES_PER_USER} custom categories.`);
  }
  if (rows.some((r) => sameName(r.name, name))) throw new ConflictError(DUPLICATE_NAME);

  const iconName = (body.icon_name || DEFAULT_CUSTOM_ICON).trim() || DEFAULT_CUSTOM_ICON;
  const color = (body.color || DEFAULT_CUSTOM_COLOR).trim() || DEFAULT_CUSTOM_COLOR;
  if (!HEX_COLOR.test(color)) throw new ValidationError('Color must be a hex value like #94A3B8.');

  let row: CategoryRow;
  try {
    row = await repo.insertCustom(db, { userId, name, iconName, color });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(DUPLICATE_NAME);
    log.error('categories_insert_failed', { err });
    throw new UpstreamError('Could not create category.');
  }
  const parsed = rowToResponse(row);
  if (!parsed) throw new UpstreamError('Could not create category.');
  await emit(publish, [inserted('categories', row)]);
  return parsed;
}

export async function updateCategory(
  db: Db,
  userId: string,
  categoryId: string,
  body: UpdateCategoryBody,
  publish?: Publish,
): Promise<CategoryResponse> {
  const rows = await repo.listVisible(db, userId);
  const existing = rows.find((r) => r.id === categoryId);
  if (!existing) throw new NotFoundError(NOT_FOUND);

  const changesCategory = body.name != null || body.icon_name != null || body.color != null;
  if (changesCategory && existing.is_system) throw new ForbiddenError('System categories cannot be edited.');

  let name: string | null = null;
  if (body.name != null) {
    name = body.name.trim();
    if (!name) throw new ValidationError('Category name is required.');
    const key = name;
    if (rows.some((r) => r.id !== categoryId && sameName(r.name, key))) throw new ConflictError(DUPLICATE_NAME);
  }
  const iconName = body.icon_name ? body.icon_name.trim() || DEFAULT_CUSTOM_ICON : null;
  const color = body.color ? body.color.trim() || DEFAULT_CUSTOM_COLOR : null;
  if (color !== null && !HEX_COLOR.test(color)) throw new ValidationError('Color must be a hex value like #94A3B8.');

  if (hasBudgetChange(body)) {
    let payload;
    try {
      payload = await repo.updateCategoryWithBudget(db, {
        userId,
        categoryId,
        name,
        iconName,
        color,
        setBudget: true,
        budgetAmount: body.budget_amount ?? null,
      });
    } catch (err) {
      if (hasPgCode(err, NO_DATA_FOUND)) throw new NotFoundError(NOT_FOUND);
      if (hasPgCode(err, INSUFFICIENT_PRIVILEGE)) throw new ForbiddenError('System categories cannot be edited.');
      if (hasPgCode(err, WRONG_SCOPE)) throw new ValidationError('Only spending categories can have a budget.');
      if (isUniqueViolation(err)) throw new ConflictError(DUPLICATE_NAME);
      throw err;
    }
    const parsed = rowToResponse(payload.category);
    if (!parsed) throw new UpstreamError('Could not update category.');
    parsed.budget_amount = payload.monthly_amount == null ? null : formatMoney(payload.monthly_amount);
    // A budget-only change leaves the `categories` row untouched: nothing for the app to refresh.
    if (changesCategory) await emit(publish, [updated('categories', payload.category)]);
    return parsed;
  }

  let row: CategoryRow | null;
  try {
    row = await repo.updateCustom(db, {
      userId,
      categoryId,
      name: name ?? existing.name,
      iconName: iconName ?? existing.icon_name ?? DEFAULT_CUSTOM_ICON,
      color: color ?? existing.color ?? DEFAULT_CUSTOM_COLOR,
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(DUPLICATE_NAME);
    throw err;
  }
  if (!row) throw new NotFoundError(NOT_FOUND);
  const parsed = rowToResponse(row);
  if (!parsed) throw new UpstreamError('Could not update category.');
  await emit(publish, [updated('categories', row)]);
  return parsed;
}

/** Shared by delete-impact and delete: fetch visibility + transaction count concurrently. */
async function loadForDelete(db: Db, userId: string, categoryId: string) {
  const [rows, txCount] = await Promise.all([
    repo.listVisible(db, userId),
    repo.countActiveTransactions(db, userId, categoryId),
  ]);
  const existing = rows.find((r) => r.id === categoryId);
  if (!existing) throw new NotFoundError(NOT_FOUND);
  if (existing.is_system) throw new ForbiddenError('System categories cannot be deleted.');
  return { rows, txCount };
}

export async function getDeleteImpact(
  db: Db,
  userId: string,
  categoryId: string,
): Promise<{ transaction_count: number }> {
  const { txCount } = await loadForDelete(db, userId, categoryId);
  return { transaction_count: txCount };
}

export async function deleteCategory(
  db: Db,
  userId: string,
  categoryId: string,
  reassignToCategoryId: string | undefined,
  publish?: Publish,
): Promise<void> {
  const { rows, txCount } = await loadForDelete(db, userId, categoryId);
  const events: ChangeEvent[] = [];
  if (txCount > 0) {
    if (!reassignToCategoryId || reassignToCategoryId === categoryId) {
      throw new ValidationError('Choose a category to move transactions to before deleting.');
    }
    const target = rows.find((r) => r.id === reassignToCategoryId);
    if (!target?.name || target.scope !== 'spend') throw new ValidationError('Target category not found.');
    const moved = await repo.reassignTransactions(db, { userId, fromCategoryId: categoryId, toCategoryId: reassignToCategoryId });
    events.push(...moved.map((row) => updated('transactions', row)));
    if (moved.length > 0) await markEngineDirty(db, userId);
  }
  if (!(await repo.deleteCustom(db, userId, categoryId))) throw new NotFoundError(NOT_FOUND);
  events.push(deleted('categories', categoryId));
  await emit(publish, events);
}
