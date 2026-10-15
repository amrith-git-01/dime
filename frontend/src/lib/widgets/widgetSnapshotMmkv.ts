import { createMMKV } from "react-native-mmkv";

import { CACHE_SCHEMA_VERSION } from "@/lib/cacheVersion";

/**
 * Plain-data copy of what the Android home-screen widgets show. The widgets render in a headless
 * JS task with no React Query and no session, so everything they need is stored here. No tokens.
 * This module must stay free of React and navigation imports.
 */
const widgetMmkv = createMMKV({ id: "widget-snapshot" });

export const WIDGET_SNAPSHOT_MMKV_KEY = "dime:widget-snapshot";

export type WidgetSnapshotTransaction = {
  id: string;
  name: string;
  /** Rupees, always positive; `type` carries the direction. */
  amount: number;
  type: "debit" | "credit";
  /** ISO time of the transaction, for the "today" filter. Empty for rows from an older build. */
  at: string;
};

export type WidgetSnapshotRecurring = {
  id: string;
  kind: "income" | "subscription";
  name: string;
  /** Rupees, always positive. */
  amount: number;
  /** Local calendar day it is next due, `yyyy-MM-dd`. */
  nextDueDate: string;
};

export type WidgetSnapshotCategory = {
  id: string;
  name: string;
  color: string | null;
  iconName: string | null;
  /** Rupees spent this month. */
  spent: number;
  /** Monthly category budget in rupees, when one is set. */
  budget: number | null;
};

export type WidgetSnapshot = {
  version: number;
  /** Owner of the snapshot, for the writer; widgets never see another user's data. */
  userId: string;
  /** When the home overview behind the numbers was fetched (epoch ms). */
  updatedAt: number;
  /** Local `yyyy-MM` the month totals describe (the month `updatedAt` falls in). */
  monthKey: string;
  /** Local `yyyy-MM-dd` the "today" total describes. */
  dayKey: string;
  /** Rupee amounts. Format them with `@/utils/currency`, as the app does. */
  spentThisMonth: number;
  recurringSpent: number;
  flexibleSpent: number;
  monthlyBudget: number | null;
  budgetLeft: number | null;
  spentToday: number;
  recentTransactions: WidgetSnapshotTransaction[];
  topCategories: WidgetSnapshotCategory[];
  /** Active recurring income and bills, soonest first; the widget picks what is due soon at draw time. */
  recurring: WidgetSnapshotRecurring[];
};

/** Synchronous read. A snapshot written by another schema version is dropped, never rendered. */
export function readWidgetSnapshot(): WidgetSnapshot | null {
  const raw = widgetMmkv.getString(WIDGET_SNAPSHOT_MMKV_KEY);
  if (!raw) {
    return null;
  }
  try {
    const snapshot = JSON.parse(raw) as WidgetSnapshot;
    if (snapshot?.version !== CACHE_SCHEMA_VERSION) {
      widgetMmkv.remove(WIDGET_SNAPSHOT_MMKV_KEY);
      return null;
    }
    if (
      typeof snapshot.spentThisMonth !== "number" ||
      typeof snapshot.monthKey !== "string"
    ) {
      return null;
    }
    // Fields added after the first widget build: tolerate a snapshot that predates them.
    return { ...snapshot, recurring: snapshot.recurring ?? [] };
  } catch {
    return null;
  }
}

/** Returns false when the stored snapshot is already identical (callers skip the widget refresh). */
export function writeWidgetSnapshot(
  snapshot: Omit<WidgetSnapshot, "version">,
): boolean {
  const payload = JSON.stringify({ ...snapshot, version: CACHE_SCHEMA_VERSION });
  if (widgetMmkv.getString(WIDGET_SNAPSHOT_MMKV_KEY) === payload) {
    return false;
  }
  widgetMmkv.set(WIDGET_SNAPSHOT_MMKV_KEY, payload);
  return true;
}

/** Returns whether a snapshot was removed. */
export function clearWidgetSnapshot(): boolean {
  if (!widgetMmkv.contains(WIDGET_SNAPSHOT_MMKV_KEY)) {
    return false;
  }
  widgetMmkv.remove(WIDGET_SNAPSHOT_MMKV_KEY);
  return true;
}

/**
 * Applies `change` to the stored snapshot (the widgets' optimistic bump after a preset add or undo).
 * Returns false when there is no snapshot or the change left it identical.
 */
export function updateWidgetSnapshot(
  change: (snapshot: WidgetSnapshot) => WidgetSnapshot,
): boolean {
  const current = readWidgetSnapshot();
  if (!current) {
    return false;
  }
  const { version: _version, ...next } = change(current);
  return writeWidgetSnapshot(next);
}
