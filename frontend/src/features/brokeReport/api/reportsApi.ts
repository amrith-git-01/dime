import { isAxiosError } from "axios";

import { dimeApi } from "@/lib/api/dimeApi";

import {
  REPORT_TITLE_IDS,
  type ReportCategory,
  type ReportListItem,
  type ReportSnapshot,
  type ReportWin,
} from "../types";
import { isReportPeriodKey } from "../utils/periodKey";
import { isReportSnapshot } from "../utils/snapshotShape";

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : null;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function count(value: unknown): number {
  return Math.max(0, Math.trunc(num(value)));
}

function share(value: unknown): number {
  return Math.min(1, Math.max(0, num(value)));
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** A decimal string like the API sends ("18620.00"); a number is accepted; anything else is null. */
function money(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return value;
  }
  return null;
}

function mapCategory(raw: unknown): ReportCategory | null {
  const item = obj(raw);
  if (!item) {
    return null;
  }
  const id = nonEmpty(item.id);
  return {
    id,
    name: nonEmpty(item.name) ?? "Uncategorized",
    icon_name: nonEmpty(item.icon_name),
    color: nonEmpty(item.color),
    amount: money(item.amount) ?? "0",
    share: share(item.share),
    count: count(item.count),
  };
}

function mapTopPayee(raw: unknown): ReportSnapshot["top_payee"] {
  const item = obj(raw);
  const name = nonEmpty(item?.display_name);
  const visits = count(item?.count);
  // A regular needs a name to show and at least one visit; anything less is "no regular".
  if (!item || !name || visits < 1) {
    return null;
  }
  return {
    payee_key: text(item.payee_key, name),
    display_name: name,
    count: visits,
    amount: money(item.amount) ?? "0",
  };
}

function mapBiggestSpend(raw: unknown): ReportSnapshot["biggest_spend"] {
  const item = obj(raw);
  const amount = money(item?.amount);
  if (!item || amount === null) {
    return null;
  }
  return {
    amount,
    display_name: text(item.display_name),
    category_name: text(item.category_name),
    date: text(item.date),
  };
}

function mapBusiestDay(raw: unknown): ReportSnapshot["busiest_day"] {
  const item = obj(raw);
  const amount = money(item?.amount);
  const date = nonEmpty(item?.date);
  if (!item || amount === null || date === null) {
    return null;
  }
  return { date, amount, count: count(item.count) };
}

function mapWeekday(raw: unknown): ReportSnapshot["weekday"] {
  const item = obj(raw);
  const totals =
    Array.isArray(item?.totals) && item.totals.length === 7
      ? item.totals.map((total) => money(total) ?? "0")
      : Array.from({ length: 7 }, () => "0");
  return {
    totals,
    peak_index: Math.min(6, count(item?.peak_index)),
    weekend_share: share(item?.weekend_share),
  };
}

/** A win the app can tell; every unknown or incomplete one becomes `none`, so no empty slide plays. */
function mapWin(raw: unknown): ReportWin {
  const item = obj(raw);
  switch (item?.kind) {
    case "category_down": {
      const name = nonEmpty(item.category_name);
      const delta = money(item.delta);
      if (!name || delta === null) {
        return { kind: "none" };
      }
      return {
        kind: "category_down",
        category_id: text(item.category_id),
        category_name: name,
        icon_name: nonEmpty(item.icon_name),
        color: nonEmpty(item.color),
        amount: money(item.amount) ?? "0",
        usual: money(item.usual) ?? "0",
        delta,
      };
    }
    case "no_spend_streak": {
      const days = count(item.days);
      if (days < 1) {
        return { kind: "none" };
      }
      return {
        kind: "no_spend_streak",
        days,
        start: text(item.start),
        end: text(item.end),
      };
    }
    case "lowest_month": {
      const spent = money(item.spent);
      if (spent === null) {
        return { kind: "none" };
      }
      return {
        kind: "lowest_month",
        spent,
        previous_lowest: money(item.previous_lowest) ?? "0",
        months_compared: Math.max(1, count(item.months_compared)),
      };
    }
    default:
      return { kind: "none" };
  }
}

function mapTitle(raw: unknown): ReportSnapshot["title"] {
  const item = obj(raw);
  const id = (REPORT_TITLE_IDS as readonly unknown[]).includes(item?.id)
    ? (item?.id as string)
    : "steady";
  const evidence: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(obj(item?.evidence) ?? {})) {
    if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) {
      evidence[key] = value;
    }
  }
  return { id, evidence };
}

/**
 * Defensive read of a stored snapshot, nested shapes included: a newer or older server may leave
 * fields out or send a different shape, and one bad field must not crash the player or print
 * "undefined". Unusable parts become "nothing" (a null section, the `none` win, the `steady` title),
 * which hides the slide that needs them. Returns null when it is not a snapshot at all.
 */
export function mapReportSnapshot(raw: unknown): ReportSnapshot | null {
  if (!isReportSnapshot(raw)) {
    return null;
  }
  const item = raw as unknown as Obj;
  const delta = money(item.vs_usual_delta);
  // "Up" or "down" without how much has nothing to say: it reads as no comparison.
  const vsUsual =
    item.vs_usual === "same" ||
    ((item.vs_usual === "up" || item.vs_usual === "down") && delta !== null)
      ? item.vs_usual
      : null;
  return {
    version: raw.version,
    period_key: raw.period_key,
    year: raw.year,
    month: raw.month,
    timezone: text(item.timezone, "Asia/Kolkata"),
    generated_at: text(item.generated_at),
    slides: Array.isArray(item.slides)
      ? item.slides.filter((id): id is string => typeof id === "string")
      : [],
    debit_count: count(item.debit_count),
    spent: money(item.spent) ?? "0",
    income: money(item.income) ?? "0",
    usual_spent: money(item.usual_spent),
    vs_usual: vsUsual,
    vs_usual_delta: delta,
    categories: Array.isArray(item.categories)
      ? item.categories
          .map(mapCategory)
          .filter((category): category is ReportCategory => category !== null)
      : [],
    top_payee: mapTopPayee(item.top_payee),
    biggest_spend: mapBiggestSpend(item.biggest_spend),
    busiest_day: mapBusiestDay(item.busiest_day),
    weekday: mapWeekday(item.weekday),
    no_spend_days: count(item.no_spend_days),
    longest_no_spend_streak: count(item.longest_no_spend_streak),
    first_week_share: share(item.first_week_share),
    win: mapWin(item.win),
    title: mapTitle(item.title),
  };
}

/** Rows of the list endpoint; a row without a valid period is dropped. */
export function mapReportListItems(raw: unknown): ReportListItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const items: ReportListItem[] = [];
  for (const row of raw) {
    const item = obj(row);
    if (!item || !isReportPeriodKey(item.period_key)) {
      continue;
    }
    items.push({
      period_key: item.period_key,
      year: num(item.year, Number(item.period_key.slice(0, 4))),
      month: num(item.month, Number(item.period_key.slice(5, 7))),
      debit_count: count(item.debit_count),
      viewed: item.viewed === true,
    });
  }
  return items;
}

/** True for the "no such report" answer, which is a normal state and not a failure. */
export function isReportNotFound(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

/** Stored reports of the last 12 months, newest first. */
export async function fetchReportList(): Promise<ReportListItem[]> {
  const { data } = await dimeApi.get<{ items: ReportListItem[] }>(
    "/api/v1/reports",
  );
  return mapReportListItems(data?.items);
}

/** The stored snapshot, or null when none is stored (not built yet, not eligible, current month). */
export async function fetchReport(
  periodKey: string,
): Promise<ReportSnapshot | null> {
  try {
    const { data } = await dimeApi.get<ReportSnapshot>(
      `/api/v1/reports/${periodKey}`,
    );
    const snapshot = mapReportSnapshot(data);
    if (!snapshot) {
      // A 200 that is not a snapshot is a failure (retry), not "no such report".
      throw new Error("The report could not be read");
    }
    return snapshot;
  } catch (error) {
    if (isReportNotFound(error)) {
      return null;
    }
    throw error;
  }
}

export async function markReportViewed(periodKey: string): Promise<void> {
  await dimeApi.post(`/api/v1/reports/${periodKey}/viewed`);
}
