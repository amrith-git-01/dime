import type { ReportTitleId } from "../types";

/**
 * Report copy is a table of templates per roast level. A template turns plain facts (already
 * formatted strings and counts: nothing in it can be undefined) into one line, and every slot has
 * at least three of them: `pickVariant` chooses one from a seed, so a report reads the same every
 * time it is opened but two months do not read alike.
 *
 * Tone rules for every level: roast the habit, never the person. Never shame income, being over
 * budget or small amounts; no body or appearance jokes; plain English; rupees, UPI and chai are
 * welcome, brand names are not (a payee name is only ever the user's own data).
 */
export type Template<F> = (facts: F) => string;

export type Variants<F> = readonly [
  Template<F>,
  Template<F>,
  Template<F>,
  ...Template<F>[],
];

export type TitleFacts = {
  month: string;
  debits: number;
  weekendPct: number;
  firstWeekPct: number;
  noSpendDays: number;
  payee: string;
  visits: number;
};

export type SparseFacts = { month: string; debits: number };

export type CoverFacts = { month: string; year: number; titleName: string; debits: number };

export type DamageFacts = {
  month: string;
  /** Compact rupees, "₹18.6k". */
  spent: string;
  debits: number;
  /** "₹19.9k"; the usual month, or "your usual" when there is none. */
  usual: string;
  /** Compact absolute difference to the usual month. */
  delta: string;
};

export type LineupFacts = {
  top: string;
  topPct: number;
  topAmount: string;
  second: string;
  categories: number;
};

export type RegularFacts = { payee: string; visits: number; total: string };

export type MomentFacts = {
  amount: string;
  name: string;
  category: string;
  /** "14 Oct" */
  date: string;
  busyDate: string;
  busyAmount: string;
  busyCount: number;
};

export type RhythmFacts = {
  peakDay: string;
  weekendPct: number;
  noSpendDays: number;
  streak: number;
};

export type WinCategoryFacts = {
  category: string;
  amount: string;
  usual: string;
  delta: string;
};
export type WinStreakFacts = { days: number; start: string; end: string };
export type WinLowestFacts = { spent: string; previousLowest: string; months: number };

export type ClosingFacts = {
  month: string;
  titleName: string;
  spent: string;
  debits: number;
};

export type LevelCopy = {
  /** Name of each title (the cover's headline) and a one-line tagline under it. */
  titles: Record<ReportTitleId, { name: string; tagline: Variants<TitleFacts> }>;
  /** A short month: the cover says why the report is short. */
  sparse: { note: Variants<SparseFacts> };
  cover: { kicker: Variants<CoverFacts>; line: Variants<CoverFacts> };
  damage: {
    kicker: Variants<DamageFacts>;
    line: Variants<DamageFacts>;
    chipUp: Variants<DamageFacts>;
    chipDown: Variants<DamageFacts>;
    chipSame: Variants<DamageFacts>;
  };
  lineup: { kicker: Variants<LineupFacts>; line: Variants<LineupFacts> };
  regular: { kicker: Variants<RegularFacts>; line: Variants<RegularFacts> };
  moment: {
    biggestKicker: Variants<MomentFacts>;
    biggestLine: Variants<MomentFacts>;
    busiestKicker: Variants<MomentFacts>;
    busiestLine: Variants<MomentFacts>;
  };
  rhythm: {
    kicker: Variants<RhythmFacts>;
    line: Variants<RhythmFacts>;
    weekendLine: Variants<RhythmFacts>;
    calmLine: Variants<RhythmFacts>;
  };
  win: {
    categoryKicker: Variants<WinCategoryFacts>;
    categoryLine: Variants<WinCategoryFacts>;
    streakKicker: Variants<WinStreakFacts>;
    streakLine: Variants<WinStreakFacts>;
    lowestKicker: Variants<WinLowestFacts>;
    lowestLine: Variants<WinLowestFacts>;
  };
  closing: {
    kicker: Variants<ClosingFacts>;
    line: Variants<ClosingFacts>;
    /** The message sent along with the shared card. */
    share: Variants<ClosingFacts>;
  };
};
