import { REPORT_TITLE_IDS, type ReportSnapshot, type ReportTitleId } from "../types";
import {
  formatDayMonth,
  formatReportAmount,
  monthName,
  weekdayName,
} from "../utils/reportFormat";
import { gentleCopy } from "./gentle";
import { savageCopy } from "./savage";
import { pickNamelessVariant, pickVariant } from "./seed";
import { SPARSE_SLIDE_COUNT } from "../utils/storyLogic";
import { spicyCopy } from "./spicy";
import type { LevelCopy, MomentFacts } from "./types";

const COPY_BY_LEVEL: Record<string, LevelCopy> = {
  gentle: gentleCopy,
  spicy: spicyCopy,
  savage: savageCopy,
};

export type ResolvedCopy = {
  titleId: ReportTitleId;
  title: {
    name: string;
    tagline: string;
    /** The tagline for the shared picture: never names a payee. */
    shareTagline: string;
  };
  /** Why the report is short; null for a normal month. */
  sparseNote: string | null;
  cover: { kicker: string; line: string };
  damage: {
    kicker: string;
    line: string;
    chip: string | null;
    chipDirection: "up" | "down" | "same" | null;
  };
  lineup: { kicker: string; line: string };
  regular: { kicker: string; line: string } | null;
  moment: {
    biggest: { kicker: string; line: string } | null;
    busiest: { kicker: string; line: string } | null;
  };
  rhythm: {
    kicker: string;
    line: string;
    weekendLine: string;
    /** Null when there were no no-spend days (there is nothing calm to say). */
    calmLine: string | null;
  };
  win: { kicker: string; line: string } | null;
  closing: { kicker: string; line: string; share: string };
};

function pct(share: number): number {
  const n = Number.isFinite(share) ? share : 0;
  return Math.round(Math.min(1, Math.max(0, n)) * 100);
}

function evidenceNumber(
  evidence: Record<string, string | number> | undefined,
  key: string,
): number | null {
  const value = evidence?.[key];
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

export function isReportTitleId(id: string): id is ReportTitleId {
  return (REPORT_TITLE_IDS as readonly string[]).includes(id);
}

/**
 * Every line the report shows, for one roast level. Facts come from the snapshot (formatted here, so
 * a template never sees a null or a NaN) and the variant of each slot is picked from the period key:
 * the same report reads the same every time. An unknown level reads as `spicy`, an unknown title as
 * `steady`. `slideCount` is the number of slides that will play (a short report gets a note).
 */
export function resolveReportCopy(
  snapshot: ReportSnapshot,
  level: string,
  slideCount: number = snapshot.slides.length,
): ResolvedCopy {
  const copy = COPY_BY_LEVEL[level] ?? spicyCopy;
  const seed = snapshot.period_key;
  const month = monthName(snapshot.month);
  const debits = snapshot.debit_count;
  const titleId: ReportTitleId = isReportTitleId(snapshot.title.id)
    ? snapshot.title.id
    : "steady";
  const titleCopy = copy.titles[titleId];
  const evidence = snapshot.title.evidence;

  const payeeName = snapshot.top_payee?.display_name || "your usual spot";
  const visits = snapshot.top_payee?.count ?? 0;
  const spent = formatReportAmount(snapshot.spent);

  const titleFacts = {
    month,
    debits,
    weekendPct: pct(
      evidenceNumber(evidence, "weekend_share") ?? snapshot.weekday.weekend_share,
    ),
    firstWeekPct: pct(
      evidenceNumber(evidence, "first_week_share") ?? snapshot.first_week_share,
    ),
    noSpendDays: snapshot.no_spend_days,
    payee: payeeName,
    visits,
  };
  const title = {
    name: titleCopy.name,
    tagline: pickVariant(titleCopy.tagline, titleFacts, seed, "title.tagline"),
    shareTagline: pickNamelessVariant(titleCopy.tagline, titleFacts, seed, "title.tagline"),
  };

  const sparseNote =
    slideCount <= SPARSE_SLIDE_COUNT
      ? pickVariant(copy.sparse.note, { month, debits }, seed, "sparse.note")
      : null;

  const coverFacts = { month, year: snapshot.year, titleName: title.name, debits };
  const cover = {
    kicker: pickVariant(copy.cover.kicker, coverFacts, seed, "cover.kicker"),
    line: pickVariant(copy.cover.line, coverFacts, seed, "cover.line"),
  };

  const damageFacts = {
    month,
    spent,
    debits,
    usual: snapshot.usual_spent ? formatReportAmount(snapshot.usual_spent) : "your usual",
    delta: formatReportAmount(snapshot.vs_usual_delta),
  };
  const chipDirection = snapshot.vs_usual;
  const chipTable =
    chipDirection === "up"
      ? copy.damage.chipUp
      : chipDirection === "down"
        ? copy.damage.chipDown
        : chipDirection === "same"
          ? copy.damage.chipSame
          : null;
  const damage = {
    kicker: pickVariant(copy.damage.kicker, damageFacts, seed, "damage.kicker"),
    line: pickVariant(copy.damage.line, damageFacts, seed, "damage.line"),
    chip: chipTable
      ? pickVariant(chipTable, damageFacts, seed, `damage.chip.${chipDirection}`)
      : null,
    chipDirection,
  };

  const topCategory = snapshot.categories[0];
  const lineupFacts = {
    top: topCategory?.name || "Everything",
    topPct: pct(topCategory?.share ?? 0),
    topAmount: formatReportAmount(topCategory?.amount),
    second: snapshot.categories[1]?.name || "the rest",
    categories: snapshot.categories.length,
  };
  const lineup = {
    kicker: pickVariant(copy.lineup.kicker, lineupFacts, seed, "lineup.kicker"),
    line: pickVariant(copy.lineup.line, lineupFacts, seed, "lineup.line"),
  };

  const regularFacts = {
    payee: payeeName,
    visits,
    total: formatReportAmount(snapshot.top_payee?.amount),
  };
  const regular = snapshot.top_payee
    ? {
        kicker: pickVariant(copy.regular.kicker, regularFacts, seed, "regular.kicker"),
        line: pickVariant(copy.regular.line, regularFacts, seed, "regular.line"),
      }
    : null;

  const momentFacts: MomentFacts = {
    amount: formatReportAmount(snapshot.biggest_spend?.amount),
    name: snapshot.biggest_spend?.display_name || "a purchase",
    category: snapshot.biggest_spend?.category_name || "everything else",
    date: formatDayMonth(snapshot.biggest_spend?.date) || "that day",
    busyDate: formatDayMonth(snapshot.busiest_day?.date) || "that day",
    busyAmount: formatReportAmount(snapshot.busiest_day?.amount),
    busyCount: snapshot.busiest_day?.count ?? 0,
  };
  const moment = {
    biggest: snapshot.biggest_spend
      ? {
          kicker: pickVariant(copy.moment.biggestKicker, momentFacts, seed, "moment.biggestKicker"),
          line: pickVariant(copy.moment.biggestLine, momentFacts, seed, "moment.biggestLine"),
        }
      : null,
    busiest: snapshot.busiest_day
      ? {
          kicker: pickVariant(copy.moment.busiestKicker, momentFacts, seed, "moment.busiestKicker"),
          line: pickVariant(copy.moment.busiestLine, momentFacts, seed, "moment.busiestLine"),
        }
      : null,
  };

  const rhythmFacts = {
    peakDay: weekdayName(snapshot.weekday.peak_index),
    weekendPct: pct(snapshot.weekday.weekend_share),
    noSpendDays: snapshot.no_spend_days,
    streak: snapshot.longest_no_spend_streak,
  };
  const rhythm = {
    kicker: pickVariant(copy.rhythm.kicker, rhythmFacts, seed, "rhythm.kicker"),
    line: pickVariant(copy.rhythm.line, rhythmFacts, seed, "rhythm.line"),
    weekendLine: pickVariant(copy.rhythm.weekendLine, rhythmFacts, seed, "rhythm.weekendLine"),
    calmLine:
      snapshot.no_spend_days > 0
        ? pickVariant(copy.rhythm.calmLine, rhythmFacts, seed, "rhythm.calmLine")
        : null,
  };

  const closingFacts = { month, titleName: title.name, spent, debits };
  const closing = {
    kicker: pickVariant(copy.closing.kicker, closingFacts, seed, "closing.kicker"),
    line: pickVariant(copy.closing.line, closingFacts, seed, "closing.line"),
    share: pickVariant(copy.closing.share, closingFacts, seed, "closing.share"),
  };

  return {
    titleId,
    title,
    sparseNote,
    cover,
    damage,
    lineup,
    regular,
    moment,
    rhythm,
    win: resolveWin(snapshot, copy, seed),
    closing,
  };
}

function resolveWin(
  snapshot: ReportSnapshot,
  copy: LevelCopy,
  seed: string,
): ResolvedCopy["win"] {
  const win = snapshot.win;
  switch (win.kind) {
    case "category_down": {
      const facts = {
        category: win.category_name || "that category",
        amount: formatReportAmount(win.amount),
        usual: formatReportAmount(win.usual),
        delta: formatReportAmount(win.delta),
      };
      return {
        kicker: pickVariant(copy.win.categoryKicker, facts, seed, "win.categoryKicker"),
        line: pickVariant(copy.win.categoryLine, facts, seed, "win.categoryLine"),
      };
    }
    case "no_spend_streak": {
      const facts = {
        days: win.days,
        start: formatDayMonth(win.start) || "the start",
        end: formatDayMonth(win.end) || "the end",
      };
      return {
        kicker: pickVariant(copy.win.streakKicker, facts, seed, "win.streakKicker"),
        line: pickVariant(copy.win.streakLine, facts, seed, "win.streakLine"),
      };
    }
    case "lowest_month": {
      const facts = {
        spent: formatReportAmount(win.spent),
        previousLowest: formatReportAmount(win.previous_lowest),
        months: Math.max(1, win.months_compared),
      };
      return {
        kicker: pickVariant(copy.win.lowestKicker, facts, seed, "win.lowestKicker"),
        line: pickVariant(copy.win.lowestLine, facts, seed, "win.lowestLine"),
      };
    }
    default:
      return null;
  }
}
