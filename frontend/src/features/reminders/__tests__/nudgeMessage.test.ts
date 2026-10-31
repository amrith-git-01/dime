import { REPORT_ROAST_LEVELS } from "@/features/settings/types";

import {
  buildNudgeMessage,
  describeTiming,
  formatShareAmount,
  nudgeVariants,
  type NudgeInput,
} from "../utils/nudgeMessage";

const TODAY = new Date(2026, 9, 31, 12, 0);

function input(over: Partial<NudgeInput> = {}): NudgeInput {
  return {
    level: "spicy",
    reminderId: "reminder-1",
    title: "Dinner split",
    name: "Ravi Kumar",
    amount: "800.00",
    dueDate: "2026-11-03",
    today: TODAY,
    payLink: null,
    ...over,
  };
}

describe("formatShareAmount", () => {
  it("writes whole rupees without paise and keeps real paise", () => {
    expect(formatShareAmount("800.00")).toBe("₹800");
    expect(formatShareAmount("1250.5")).toBe("₹1,250.50");
    expect(formatShareAmount("1500000")).toBe("₹15,00,000");
  });

  it("is null for nothing payable", () => {
    expect(formatShareAmount("0")).toBeNull();
    expect(formatShareAmount("abc")).toBeNull();
    expect(formatShareAmount(-3)).toBeNull();
  });
});

describe("describeTiming", () => {
  it("uses words for today, tomorrow and yesterday", () => {
    expect(describeTiming("2026-10-31", TODAY)).toEqual({ verb: "is due", timing: "today" });
    expect(describeTiming("2026-11-01", TODAY)).toEqual({ verb: "is due", timing: "tomorrow" });
    expect(describeTiming("2026-10-30", TODAY)).toEqual({ verb: "was due", timing: "yesterday" });
  });

  it("counts days with the right singular and plural, and names the date", () => {
    expect(describeTiming("2026-11-03", TODAY)).toEqual({
      verb: "is due",
      timing: "in 3 days (3 Nov)",
    });
    expect(describeTiming("2026-10-29", TODAY)).toEqual({
      verb: "was due",
      timing: "2 days ago (29 Oct)",
    });
  });

  it("copes with a malformed date", () => {
    expect(describeTiming("later", TODAY)).toEqual({ verb: "is due", timing: "soon" });
  });
});

describe("nudge variants", () => {
  it("has at least three variants for every level", () => {
    for (const level of REPORT_ROAST_LEVELS) {
      expect(nudgeVariants[level].length).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(REPORT_ROAST_LEVELS)("every %s variant carries the facts and never says undefined", (level) => {
    nudgeVariants[level].forEach((variant) => {
      const text = variant({
        hi: "Hi Ravi,",
        item: "₹800 for Dinner split",
        verb: "is due",
        timing: "in 3 days (3 Nov)",
      });
      expect(text).toContain("Hi Ravi,");
      expect(text).toContain("₹800 for Dinner split");
      expect(text).toContain("is due in 3 days (3 Nov)");
      expect(text).not.toMatch(/undefined|null|NaN|\{|\}/);
      // No emojis in copy.
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    });
  });

  it("picks the same variant for the same reminder, and spreads across reminders", () => {
    const a = buildNudgeMessage(input());
    expect(buildNudgeMessage(input())).toBe(a);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      seen.add(buildNudgeMessage(input({ reminderId: `id-${i}` })));
    }
    expect(seen.size).toBe(nudgeVariants.spicy.length);
  });
});

describe("buildNudgeMessage", () => {
  it.each(REPORT_ROAST_LEVELS)("%s: includes first name, amount, title and when", (level) => {
    const message = buildNudgeMessage(input({ level }));
    expect(message).toContain("Hi Ravi,");
    expect(message).toContain("₹800 for Dinner split");
    expect(message).toContain("in 3 days (3 Nov)");
    expect(message).not.toContain("Pay here");
  });

  it.each(REPORT_ROAST_LEVELS)("%s: reads well with no amount and no name", (level) => {
    const message = buildNudgeMessage(input({ level, amount: null, name: null }));
    expect(message.startsWith("Hi, ")).toBe(true);
    expect(message).toContain("Dinner split is due in 3 days");
    expect(message).not.toContain("₹");
    expect(message).not.toMatch(/undefined|null/);
  });

  it("treats a blank name as no name and a blank title as a generic one", () => {
    const message = buildNudgeMessage(input({ name: "   ", title: "  ", amount: null }));
    expect(message.startsWith("Hi, ")).toBe(true);
    expect(message).toContain("this payment");
  });

  it("is kind about late payments: past tense, how long, no shaming words", () => {
    for (const level of REPORT_ROAST_LEVELS) {
      for (let i = 0; i < 12; i += 1) {
        const message = buildNudgeMessage(
          input({ level, reminderId: `late-${i}`, dueDate: "2026-10-29" }),
        );
        expect(message).toContain("was due 2 days ago (29 Oct)");
        expect(message).not.toMatch(/\b(lazy|cheap|broke|deadbeat|shame|pathetic)\b/i);
      }
    }
  });

  it("says yesterday and tomorrow in words", () => {
    expect(buildNudgeMessage(input({ dueDate: "2026-10-30" }))).toContain("was due yesterday");
    expect(buildNudgeMessage(input({ dueDate: "2026-11-01" }))).toContain("is due tomorrow");
    expect(buildNudgeMessage(input({ dueDate: "2026-10-31" }))).toContain("is due today");
  });

  it("adds the pay link on its own line only when there is one", () => {
    const link = "https://api.example/pay?pa=me@bank&am=800.00";
    const message = buildNudgeMessage(input({ payLink: link }));
    expect(message.endsWith(`\n\nPay here: ${link}`)).toBe(true);
    expect(message.split("\n\n")).toHaveLength(2);
  });

  it("falls back to the spicy voice for an unknown level", () => {
    const odd = buildNudgeMessage(input({ level: "nuclear" as never }));
    expect(odd).toBe(buildNudgeMessage(input({ level: "spicy" })));
  });
});
