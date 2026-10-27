import { FULL_SNAPSHOT, MINIMAL_SNAPSHOT } from "../__fixtures__/reportFixtures";
import { REPORT_COPY, hashString, pickVariant, resolveReportCopy } from "../copy";
import type { LevelCopy, Variants } from "../copy";
import {
  REPORT_SLIDE_IDS,
  REPORT_TITLE_IDS,
  type ReportSnapshot,
} from "../types";
import { REPORT_ROAST_LEVELS } from "@/features/settings/types";

const BAD = /undefined|NaN|null|\[object|Infinity|\{\{|\$\{/;

/** Every string a resolved copy holds, flattened. */
function strings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

function allVariants(copy: LevelCopy): Variants<never>[] {
  const out: Variants<never>[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      out.push(node as unknown as Variants<never>);
    } else if (node && typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  };
  walk(copy);
  return out;
}

const EDGE_CASES: Record<string, ReportSnapshot> = {
  full: FULL_SNAPSHOT,
  minimal: MINIMAL_SNAPSHOT,
  zeros: {
    ...FULL_SNAPSHOT,
    debit_count: 0,
    spent: "0.00",
    income: "0.00",
    usual_spent: "0.00",
    vs_usual: "same",
    vs_usual_delta: "0.00",
    categories: [
      { id: null, name: "Uncategorized", icon_name: null, color: null, amount: "0.00", share: 0, count: 0 },
    ],
    no_spend_days: 0,
    longest_no_spend_streak: 0,
    first_week_share: 0,
    weekday: { totals: ["0", "0", "0", "0", "0", "0", "0"], peak_index: 0, weekend_share: 0 },
    busiest_day: { date: "2026-10-01", amount: "0.00", count: 0 },
    top_payee: { payee_key: "x", display_name: "", count: 0, amount: "0.00" },
  },
  nulls: {
    ...FULL_SNAPSHOT,
    usual_spent: null,
    vs_usual: null,
    vs_usual_delta: null,
    categories: [],
    top_payee: null,
    biggest_spend: null,
    busiest_day: null,
    win: { kind: "none" },
  },
  garbage: {
    ...FULL_SNAPSHOT,
    spent: "oops",
    vs_usual_delta: "NaN",
    categories: [
      { id: null, name: "", icon_name: null, color: null, amount: "x", share: Number.NaN, count: 0 },
    ],
    weekday: { totals: ["a", "b", "c", "d", "e", "f", "g"], peak_index: 99, weekend_share: Number.NaN },
    title: { id: "from_the_future", evidence: { weekend_share: "lots" } },
    biggest_spend: { amount: "", display_name: "", category_name: "", date: "nope" },
  },
};

const WINS: ReportSnapshot["win"][] = [
  { kind: "none" },
  {
    kind: "category_down",
    category_id: "c",
    category_name: "Food & Dining",
    icon_name: null,
    color: null,
    amount: "7450.00",
    usual: "9100.00",
    delta: "1650.00",
  },
  { kind: "category_down", category_id: "c", category_name: "", icon_name: null, color: null, amount: "0", usual: "0", delta: "0" },
  { kind: "no_spend_streak", days: 5, start: "2026-10-05", end: "2026-10-09" },
  { kind: "no_spend_streak", days: 1, start: "", end: "" },
  { kind: "lowest_month", spent: "900.00", previous_lowest: "1200.00", months_compared: 3 },
  { kind: "lowest_month", spent: "0", previous_lowest: "0", months_compared: 0 },
];

describe("report copy tables", () => {
  it("has copy for every roast level", () => {
    expect(Object.keys(REPORT_COPY).sort()).toEqual([...REPORT_ROAST_LEVELS].sort());
  });

  it.each(REPORT_ROAST_LEVELS)("%s has a name and tagline for every title id", (level) => {
    for (const id of REPORT_TITLE_IDS) {
      const title = REPORT_COPY[level].titles[id];
      expect(title.name.length).toBeGreaterThan(2);
      expect(title.tagline.length).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(REPORT_ROAST_LEVELS)("%s has copy for every slide id", (level) => {
    for (const id of REPORT_SLIDE_IDS) {
      expect(REPORT_COPY[level]).toHaveProperty(id);
    }
    expect(REPORT_COPY[level]).toHaveProperty("sparse");
  });

  it.each(REPORT_ROAST_LEVELS)("%s has at least three variants in every slot", (level) => {
    const slots = allVariants(REPORT_COPY[level]);
    expect(slots.length).toBeGreaterThan(30);
    for (const variants of slots) {
      expect(variants.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses a different title name per level (the level changes the voice)", () => {
    for (const id of REPORT_TITLE_IDS) {
      const names = REPORT_ROAST_LEVELS.map((level) => REPORT_COPY[level].titles[id].name);
      expect(new Set(names).size).toBe(3);
    }
  });
});

describe("resolveReportCopy", () => {
  describe.each(REPORT_ROAST_LEVELS)("%s", (level) => {
    it.each(Object.entries(EDGE_CASES))("%s: no template prints undefined, NaN or null", (_name, snapshot) => {
      for (const win of WINS) {
        const copy = resolveReportCopy({ ...snapshot, win }, level);
        for (const line of strings(copy)) {
          expect(line).not.toMatch(BAD);
          expect(line.trim().length).toBeGreaterThan(0);
        }
      }
    });

    it.each(REPORT_TITLE_IDS)("title %s resolves with a name and tagline", (id) => {
      for (const snapshot of Object.values(EDGE_CASES)) {
        const copy = resolveReportCopy({ ...snapshot, title: { id, evidence: {} } }, level);
        expect(copy.titleId).toBe(id);
        expect(copy.title.name).toBe(REPORT_COPY[level].titles[id].name);
        expect(copy.title.tagline).not.toMatch(BAD);
      }
    });
  });

  it("picks the vs-usual chip by direction, and none without a usual month", () => {
    const base = resolveReportCopy(FULL_SNAPSHOT, "spicy");
    const up = resolveReportCopy({ ...FULL_SNAPSHOT, vs_usual: "up" }, "spicy");
    const same = resolveReportCopy({ ...FULL_SNAPSHOT, vs_usual: "same" }, "spicy");
    const none = resolveReportCopy({ ...FULL_SNAPSHOT, vs_usual: null }, "spicy");
    expect(base.damage.chipDirection).toBe("down");
    expect(base.damage.chip).toContain("₹1.3k");
    expect(up.damage.chipDirection).toBe("up");
    expect(up.damage.chip).toContain("₹1.3k");
    expect(same.damage.chip).not.toMatch(/₹/);
    expect(none.damage.chip).toBeNull();
  });

  it("returns win copy per kind and none for no win", () => {
    const kinds = WINS.filter((win) => win.kind !== "none");
    for (const win of kinds) {
      expect(resolveReportCopy({ ...FULL_SNAPSHOT, win }, "spicy").win).not.toBeNull();
    }
    expect(resolveReportCopy({ ...FULL_SNAPSHOT, win: { kind: "none" } }, "spicy").win).toBeNull();
  });

  it("writes a sparse-month note only for a short report", () => {
    expect(resolveReportCopy(FULL_SNAPSHOT, "spicy", 8).sparseNote).toBeNull();
    expect(resolveReportCopy(MINIMAL_SNAPSHOT, "spicy", 4).sparseNote).toMatch(/\S/);
  });

  it("reads the same every time, and changes with the roast level", () => {
    const a = resolveReportCopy(FULL_SNAPSHOT, "spicy");
    const b = resolveReportCopy(FULL_SNAPSHOT, "spicy");
    expect(a).toEqual(b);
    const gentle = resolveReportCopy(FULL_SNAPSHOT, "gentle");
    const savage = resolveReportCopy(FULL_SNAPSHOT, "savage");
    expect(gentle.title.name).not.toBe(a.title.name);
    expect(savage.damage.line).not.toBe(gentle.damage.line);
  });

  it("falls back to spicy for an unknown level and to steady for an unknown title", () => {
    const copy = resolveReportCopy(
      { ...FULL_SNAPSHOT, title: { id: "from_the_future", evidence: {} } },
      "mild",
    );
    expect(copy.titleId).toBe("steady");
    expect(copy.title.name).toBe(REPORT_COPY.spicy.titles.steady.name);
  });

  it("varies across months: the seed is the period key", () => {
    const months = Array.from({ length: 12 }, (_, i) =>
      resolveReportCopy(
        { ...FULL_SNAPSHOT, period_key: `2026-${String(i + 1).padStart(2, "0")}`, month: i + 1 },
        "spicy",
      ).damage.line.replace(/October|January|February|March|April|May|June|July|August|September|November|December/, ""),
    );
    expect(new Set(months).size).toBeGreaterThan(1);
  });
});

/** Every fact any template reads, with the counts set to `n`. */
function factsFor(n: number) {
  return {
    month: "October",
    year: 2026,
    titleName: "The Test Title",
    debits: n,
    weekendPct: n,
    firstWeekPct: n,
    noSpendDays: n,
    payee: "Corner Cafe",
    visits: n,
    spent: "₹1k",
    usual: "₹1k",
    delta: "₹1k",
    top: "Food & Dining",
    topPct: n,
    topAmount: "₹1k",
    second: "Transport",
    categories: n,
    total: "₹1k",
    amount: "₹1k",
    name: "City Mall",
    category: "Shopping",
    date: "11 Oct",
    busyDate: "18 Oct",
    busyAmount: "₹1k",
    busyCount: n,
    peakDay: "Friday",
    streak: n,
    days: n,
    start: "5 Oct",
    end: "9 Oct",
    months: n,
    previousLowest: "₹1k",
  };
}

describe("every variant, with counts 0, 1 and 2", () => {
  const WRONG_PLURAL = /\b1 (?:[\w-]+ )?(?:visits|times|payments|days|months|no-spend days|small payments|calm days)\b/;
  const ZERO_RUN = /(?:run|streak)[^.]*\b0\b|\b0 days?\b[^.]*(?:run|streak)/i;

  it.each(REPORT_ROAST_LEVELS)("%s reads right for any count", (level) => {
    const slots = allVariants(REPORT_COPY[level]) as unknown as ((facts: unknown) => string)[][];
    expect(slots.length).toBeGreaterThan(30);
    for (const n of [0, 1, 2]) {
      for (const variants of slots) {
        for (const variant of variants) {
          const line = variant(factsFor(n));
          expect(line).not.toMatch(BAD);
          expect(line).not.toMatch(WRONG_PLURAL);
          expect(line.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it.each(REPORT_ROAST_LEVELS)("%s says 1 visit and 1 time, not 1 visits", (level) => {
    const snapshot: ReportSnapshot = {
      ...FULL_SNAPSHOT,
      top_payee: { payee_key: "x", display_name: "Corner Cafe", count: 1, amount: "100.00" },
      busiest_day: { date: "2026-10-18", amount: "100.00", count: 1 },
    };
    for (let month = 1; month <= 12; month += 1) {
      const key = `2026-${String(month).padStart(2, "0")}`;
      const copy = resolveReportCopy({ ...snapshot, period_key: key }, level);
      for (const line of [copy.regular?.line ?? "", copy.moment.busiest?.line ?? ""]) {
        expect(line).not.toMatch(WRONG_PLURAL);
      }
    }
  });

  it.each(REPORT_ROAST_LEVELS)("%s leaves out a streak of 0 days instead of printing it", (level) => {
    for (let month = 1; month <= 12; month += 1) {
      const key = `2026-${String(month).padStart(2, "0")}`;
      const copy = resolveReportCopy(
        { ...FULL_SNAPSHOT, period_key: key, no_spend_days: 4, longest_no_spend_streak: 0 },
        level,
      );
      expect(copy.rhythm.calmLine).not.toMatch(ZERO_RUN);
      expect(copy.rhythm.calmLine).not.toMatch(BAD);
    }
  });

  it("puts a unit on every streak line", () => {
    for (const level of REPORT_ROAST_LEVELS) {
      for (const days of [1, 2, 5]) {
        const win = { kind: "no_spend_streak", days, start: "2026-10-05", end: "2026-10-09" } as const;
        for (let month = 1; month <= 12; month += 1) {
          const key = `2026-${String(month).padStart(2, "0")}`;
          const line = resolveReportCopy({ ...FULL_SNAPSHOT, period_key: key, win }, level).win?.line ?? "";
          expect(line).toMatch(new RegExp(`\\b${days} (?:calm )?days?\\b`));
        }
      }
    }
  });

  it("has no calm line without calm days", () => {
    const copy = resolveReportCopy({ ...FULL_SNAPSHOT, no_spend_days: 0, longest_no_spend_streak: 0 }, "spicy");
    expect(copy.rhythm.calmLine).toBeNull();
  });

  it("does not claim a number of excuses in a sparse month", () => {
    const sparse = resolveReportCopy(
      { ...MINIMAL_SNAPSHOT, title: { id: "one_big_splurge", evidence: {} } },
      "savage",
      4,
    );
    expect(JSON.stringify(REPORT_COPY.savage.titles.one_big_splurge.tagline.map((t) => t({
      month: "August", debits: 5, weekendPct: 0, firstWeekPct: 0, noSpendDays: 0, payee: "x", visits: 0,
    })))).not.toMatch(/thirty|\b\d+ small excuses/i);
    expect(sparse.title.tagline).not.toMatch(/thirty/i);
  });
});

describe("the shared picture never names a payee", () => {
  const PAYEE = "Corner Cafe";
  const loyalist: ReportSnapshot = {
    ...FULL_SNAPSHOT,
    title: { id: "loyalist", evidence: { visits: 9 } },
  };

  it.each(REPORT_ROAST_LEVELS)("%s: shareTagline has no payee name for any month", (level) => {
    let named = 0;
    for (let month = 1; month <= 12; month += 1) {
      const key = `2026-${String(month).padStart(2, "0")}`;
      const copy = resolveReportCopy({ ...loyalist, period_key: key }, level);
      expect(copy.title.shareTagline).not.toContain(PAYEE);
      expect(copy.title.shareTagline.trim().length).toBeGreaterThan(0);
      if (copy.title.tagline.includes(PAYEE)) {
        named += 1;
      }
    }
    // The on-screen tagline may still name it (so the filter is really doing something).
    expect(named).toBeGreaterThan(0);
  });

  it("is the same line as the tagline when that one is already nameless", () => {
    for (const id of REPORT_TITLE_IDS.filter((title) => title !== "loyalist")) {
      const copy = resolveReportCopy({ ...FULL_SNAPSHOT, title: { id, evidence: {} } }, "spicy");
      expect(copy.title.shareTagline).toBe(copy.title.tagline);
    }
  });

  it("holds when the payee name is a single letter", () => {
    const tiny: ReportSnapshot = {
      ...loyalist,
      top_payee: { payee_key: "a", display_name: "a", count: 9, amount: "10.00" },
    };
    for (let month = 1; month <= 12; month += 1) {
      const key = `2026-${String(month).padStart(2, "0")}`;
      const copy = resolveReportCopy({ ...tiny, period_key: key }, "gentle");
      expect(copy.title.shareTagline.length).toBeGreaterThan(5);
    }
  });
});

describe("pickVariant", () => {
  const variants: Variants<null> = [() => "a", () => "b", () => "c"];

  it("is deterministic for a seed and slot", () => {
    expect(pickVariant(variants, null, "2026-10", "slot")).toBe(
      pickVariant(variants, null, "2026-10", "slot"),
    );
  });

  it("spreads over all variants for different seeds", () => {
    const seen = new Set(
      Array.from({ length: 60 }, (_, i) => pickVariant(variants, null, `2026-${i}`, "slot")),
    );
    expect(seen.size).toBe(3);
  });

  it("hashes stably", () => {
    expect(hashString("2026-10|damage.line")).toBe(hashString("2026-10|damage.line"));
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});
