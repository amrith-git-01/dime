import { count, previousMonths, runClause } from "./seed";
import type { LevelCopy } from "./types";

/** Savage: playful, no mercy for the habit, still kind underneath. Never about the person. */
export const savageCopy: LevelCopy = {
  titles: {
    one_big_splurge: {
      name: "The Main Purchase Character",
      tagline: [
        (f) => `One purchase took over ${f.month} and never gave the spotlight back.`,
        () => "The rest of the month was just the supporting cast.",
        () => "One big decision, and a bunch of small ones.",
      ],
    },
    loyalist: {
      name: "The Loyalty Card Legend",
      tagline: [
        (f) => `${f.payee} should name a chair after you. ${count(f.visits, "visit")}.`,
        () => "You do not browse. You return.",
        () => "Variety is overrated, apparently.",
      ],
    },
    weekend_warrior: {
      name: "The Weekend Menace",
      tagline: [
        (f) => `${f.weekendPct}% of your spending happened on a weekend. Monday never stood a chance.`,
        () => "Five days of discipline, two days of freestyle.",
        () => "Your wallet only wakes up when the alarm is off.",
      ],
    },
    payday_sprinter: {
      name: "The First-Week Firework",
      tagline: [
        (f) => `${f.firstWeekPct}% of the month went in week one. Bold strategy.`,
        () => "Week one: a parade. Week four: a documentary.",
        () => "You spend the month like it ends on the 7th.",
      ],
    },
    thousand_cuts: {
      name: "The Tiny Payments Tycoon",
      tagline: [
        (f) => `${count(f.debits, "payment")} and not one of them felt like a big deal.`,
        () => "Nothing big, everything frequent.",
        () => "Death by a thousand UPI taps.",
      ],
    },
    ghost: {
      name: "The Wallet Houdini",
      tagline: [
        (f) => `${count(f.noSpendDays, "day")} of nothing. Mysterious.`,
        () => "Now you see it, now you do not.",
        () => "Whatever you were doing on those days, it was free.",
      ],
    },
    steady: {
      name: "The Suspiciously Balanced",
      tagline: [
        () => "No spikes, no drama. It is almost rude.",
        (f) => `${f.month} was so calm we checked the data twice.`,
        () => "Boring in the best possible way.",
      ],
    },
  },
  sparse: {
    note: [
      (f) => `${count(f.debits, "payment")}. Not much to roast, so this one is short.`,
      (f) => `${f.month} was quiet, which is annoying for us. Short report.`,
      (f) => `Barely any payments in ${f.month}, so there is barely any report.`,
    ],
  },
  cover: {
    kicker: [
      (f) => `Your ${f.month} Broke Report`,
      (f) => `${f.month}: the receipts are in`,
      (f) => `${f.month}, no filter`,
    ],
    line: [
      () => "Brace yourself. It is only a little rude.",
      () => "Your wallet has notes.",
      () => "Let's go through the evidence.",
    ],
  },
  damage: {
    kicker: [
      (f) => `${f.month} cost you`,
      () => "Your wallet would like a word",
      (f) => `The ${f.month} bill`,
    ],
    line: [
      (f) => `${count(f.debits, "payment")}. Your wallet felt every one.`,
      (f) => `${count(f.debits, "payment")} of "it is only a small one".`,
      (f) => `Spread across ${count(f.debits, "payment")} so it would not look so bad.`,
    ],
    chipUp: [
      (f) => `${f.delta} more than usual. Bold.`,
      (f) => `Up ${f.delta}. "Just this once" strikes again.`,
      (f) => `${f.delta} above normal. We noticed.`,
    ],
    chipDown: [
      (f) => `${f.delta} less than usual. Who are you?`,
      (f) => `Down ${f.delta}. Suspiciously responsible.`,
      (f) => `${f.delta} under normal. Keep it up.`,
    ],
    chipSame: [
      () => "Exactly your usual. Predictable.",
      () => "Same as always. Consistent, at least.",
      () => "A perfectly average month",
    ],
  },
  lineup: {
    kicker: [() => "Where it all went", () => "The leaderboard", () => "Exhibit A"],
    line: [
      (f) => `${f.top} swallowed ${f.topPct}% of the month.`,
      (f) => `${f.topPct}% to ${f.top}. It sends its thanks.`,
      (f) => `${f.top} took ${f.topPct}% and did not even say sorry.`,
    ],
  },
  regular: {
    kicker: [() => "Your other home", () => "Most visited", () => "Regular alert"],
    line: [
      (f) => `${f.total} later, ${f.payee} knows your face.`,
      (f) => `${f.payee} again. ${f.total} of it.`,
      (f) => `You and ${f.payee} are basically a couple.`,
    ],
  },
  moment: {
    biggestKicker: [() => "The big one", () => "Your priciest decision", () => "The single biggest hit"],
    biggestLine: [
      (f) => `${f.name} on ${f.date}. ${f.category}. No notes.`,
      (f) => `${f.date}: ${f.name}. We hope it was good.`,
      (f) => `${f.name} (${f.category}) on ${f.date} did a lot of damage.`,
    ],
    busiestKicker: [() => "Peak chaos", () => "Your busiest day", () => "The day it got loud"],
    busiestLine: [
      (f) => `${f.busyDate}: ${count(f.busyCount, "payment")} and ${f.busyAmount} gone.`,
      (f) => `On ${f.busyDate} your wallet worked overtime: ${f.busyAmount}.`,
      (f) => `${f.busyDate} was a lot. ${count(f.busyCount, "payment")}, ${f.busyAmount}.`,
    ],
  },
  rhythm: {
    kicker: [() => "Your spending rhythm", () => "Your week, exposed", () => "The pattern"],
    line: [
      (f) => `${f.peakDay}s are where your wallet loses control.`,
      (f) => `${f.peakDay} is the day to watch.`,
      (f) => `Every ${f.peakDay}, your wallet panics.`,
    ],
    weekendLine: [
      (f) => `${f.weekendPct}% on weekends. Monday has questions.`,
      (f) => `Weekends took ${f.weekendPct}%.`,
      (f) => `${f.weekendPct}% weekend spending. Rest days, expensive days.`,
    ],
    calmLine: [
      (f) => `${count(f.noSpendDays, "no-spend day")}.${runClause(f.streak)} Not bad.`,
      (f) => `${count(f.noSpendDays, "day")} at zero.${runClause(f.streak, " Best streak: ")}`,
      (f) => `Calm days: ${f.noSpendDays}.${runClause(f.streak, " Longest streak: ")} Plot twist.`,
    ],
  },
  win: {
    categoryKicker: [() => "Okay, fine, a win", () => "Plot twist", () => "Credit where it is due"],
    categoryLine: [
      (f) => `${f.category} came in ${f.delta} under your usual. Look at you.`,
      (f) => `${f.delta} less on ${f.category}. We are almost proud.`,
      (f) => `${f.category} dropped ${f.delta}. That was on purpose, right?`,
    ],
    streakKicker: [() => "A miracle", () => "The wallet slept", () => "Zero days"],
    streakLine: [
      (f) => `${count(f.days, "day")} straight with nothing spent (${f.start} to ${f.end}). Impressive.`,
      (f) => `${f.start} to ${f.end}: ${count(f.days, "day")}, zero rupees. Who are you?`,
      (f) => `${count(f.days, "day")} in a row without a single payment. Respect.`,
    ],
    lowestKicker: [() => "A record", () => "Lightest month ever", () => "Unexpected"],
    lowestLine: [
      (f) => `${f.spent} is lower than ${previousMonths(f.months)}.`,
      (f) => `Lighter than ${previousMonths(f.months)}. Do not get used to it.`,
      (f) => `${f.spent}. A new low, and the good kind.`,
    ],
  },
  closing: {
    kicker: [(f) => `That was ${f.month}`, () => "Case closed", (f) => `${f.month}, roasted`],
    line: [
      (f) => `Verdict: ${f.titleName}.`,
      (f) => `You, officially: ${f.titleName}.`,
      (f) => `Sentence: one month as ${f.titleName}.`,
    ],
    share: [
      (f) => `My ${f.month} Broke Report called me ${f.titleName}. Rude, but fair.`,
      (f) => `${f.month} verdict: ${f.titleName}. Come at me.`,
      (f) => `Got roasted by my ${f.month} Broke Report: ${f.titleName}.`,
    ],
  },
};
