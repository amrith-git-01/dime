import { count, previousMonths, runClause } from "./seed";
import type { LevelCopy } from "./types";

/** Spicy (default): light teasing. The habit is the joke, never the person. */
export const spicyCopy: LevelCopy = {
  titles: {
    one_big_splurge: {
      name: "The One-Hit Wonder",
      tagline: [
        (f) => `One purchase did most of the talking in ${f.month}.`,
        () => "A quiet month with one very loud moment.",
        () => "Everything else was background noise.",
      ],
    },
    loyalist: {
      name: "The Creature of Habit",
      tagline: [
        (f) => `${f.payee} saw you ${count(f.visits, "time")}. That is a relationship.`,
        () => "You found your spot and you stuck to it.",
        () => "Loyal to a fault, and honestly, respect.",
      ],
    },
    weekend_warrior: {
      name: "The Weekend Warrior",
      tagline: [
        (f) => `${f.weekendPct}% of your spending happened on a weekend.`,
        () => "Monday to Friday you behaved. Then Saturday had plans.",
        () => "The weekend called. Your wallet answered.",
      ],
    },
    payday_sprinter: {
      name: "The Payday Sprinter",
      tagline: [
        (f) => `${f.firstWeekPct}% of the month went out in week one.`,
        () => "Week one: full speed. The rest of the month: coasting.",
        () => "You front-load your month like a pro.",
      ],
    },
    thousand_cuts: {
      name: "The Thousand Cuts Club",
      tagline: [
        (f) => `${count(f.debits, "small payment")} added up quietly.`,
        () => "No single big hit. Just a lot of little ones.",
        () => "UPI taps, chai runs and everything in between.",
      ],
    },
    ghost: {
      name: "The Disappearing Act",
      tagline: [
        (f) => `${count(f.noSpendDays, "day")} without spending a rupee.`,
        (f) => `Your wallet took ${count(f.noSpendDays, "day")} off.`,
        () => "Most days, you were nowhere near a checkout.",
      ],
    },
    steady: {
      name: "The Steady Eddie",
      tagline: [
        () => "No drama, no spikes. Just a steady month.",
        () => "Nothing stood out, and that is a compliment.",
        (f) => `A calm ${f.month} from start to finish.`,
      ],
    },
  },
  sparse: {
    note: [
      (f) => `Only ${count(f.debits, "payment")} this month, so we kept it short.`,
      (f) => `A quiet ${f.month}: ${count(f.debits, "payment")} and a short report.`,
      (f) => `Not much to go on in ${f.month}, so this one is a quick read.`,
    ],
  },
  cover: {
    kicker: [
      (f) => `Your ${f.month} Broke Report`,
      (f) => `${f.month}, unpacked`,
      (f) => `${f.month} in review`,
    ],
    line: [
      () => "Here is how your wallet did.",
      () => "Tap through. It is only a little painful.",
      () => "Let's see where it all went.",
    ],
  },
  damage: {
    kicker: [
      (f) => `In ${f.month} you spent`,
      (f) => `${f.month} cost you`,
      (f) => `The damage for ${f.month}`,
    ],
    line: [
      (f) => `${count(f.debits, "payment")} later, this is the number.`,
      (f) => `Across ${count(f.debits, "payment")}. Every chai counted.`,
      (f) => `That is ${count(f.debits, "payment")} of "just this once".`,
    ],
    chipUp: [
      (f) => `${f.delta} more than usual`,
      (f) => `Up ${f.delta} on your usual month`,
      (f) => `${f.delta} above a normal month`,
    ],
    chipDown: [
      (f) => `${f.delta} less than usual`,
      (f) => `Down ${f.delta} on your usual month`,
      (f) => `${f.delta} under a normal month`,
    ],
    chipSame: [
      () => "Right on your usual",
      () => "About the same as usual",
      () => "Pretty much a normal month",
    ],
  },
  lineup: {
    kicker: [() => "Where it went", () => "Your top spot", () => "The leaderboard"],
    line: [
      (f) => `${f.top} took ${f.topPct}% of everything.`,
      (f) => `${f.topPct}% went to ${f.top}. It earned it.`,
      (f) => `${f.top} ran the show at ${f.topPct}%.`,
    ],
  },
  regular: {
    kicker: [() => "Your regular", () => "Most visited", () => "Loyalty award"],
    line: [
      (f) => `That is ${f.total} in total.`,
      (f) => `${f.payee} should know you by now.`,
      (f) => `You and ${f.payee}: ${f.total} of history.`,
    ],
  },
  moment: {
    biggestKicker: [
      () => "Biggest single spend",
      () => "The big one",
      () => "Your priciest moment",
    ],
    biggestLine: [
      (f) => `${f.name} on ${f.date}, filed under ${f.category}.`,
      (f) => `${f.date}: ${f.name}. Worth it, hopefully.`,
      (f) => `That was ${f.name} (${f.category}) on ${f.date}.`,
    ],
    busiestKicker: [() => "Busiest day", () => "Peak chaos", () => "Your most active day"],
    busiestLine: [
      (f) => `${f.busyDate}: ${count(f.busyCount, "payment")} adding up to ${f.busyAmount}.`,
      (f) => `On ${f.busyDate} your wallet clocked in ${count(f.busyCount, "time")} for ${f.busyAmount}.`,
      (f) => `${f.busyDate} was a big one: ${f.busyAmount} over ${count(f.busyCount, "payment")}.`,
    ],
  },
  rhythm: {
    kicker: [() => "Your spending rhythm", () => "Your week, in bars", () => "When the money moves"],
    line: [
      (f) => `${f.peakDay}s are your thing.`,
      (f) => `${f.peakDay} is where your wallet comes alive.`,
      (f) => `Peak spending day: ${f.peakDay}.`,
    ],
    weekendLine: [
      (f) => `${f.weekendPct}% of it happened on weekends.`,
      (f) => `Weekends took ${f.weekendPct}%.`,
      (f) => `${f.weekendPct}% weekend spending.`,
    ],
    calmLine: [
      (f) => `${count(f.noSpendDays, "no-spend day")}.${runClause(f.streak)}`,
      (f) => `${count(f.noSpendDays, "day")} at zero.${runClause(f.streak, " Best run: ")}`,
      (f) => `Calm days: ${f.noSpendDays}.${runClause(f.streak, " Longest calm streak: ")}`,
    ],
  },
  win: {
    categoryKicker: [() => "A small win", () => "Nicely done", () => "Look at you"],
    categoryLine: [
      (f) => `${f.category} came in ${f.delta} under your usual.`,
      (f) => `You spent ${f.delta} less on ${f.category} than usual.`,
      (f) => `${f.category} dropped ${f.delta} below normal. Quiet flex.`,
    ],
    streakKicker: [() => "A streak worth noting", () => "Wallet on pause", () => "Zero days"],
    streakLine: [
      (f) => `${count(f.days, "day")} in a row without spending (${f.start} to ${f.end}).`,
      (f) => `${f.start} to ${f.end}: ${count(f.days, "day")}, not a rupee spent.`,
      (f) => `You went ${count(f.days, "day")} straight without paying for anything.`,
    ],
    lowestKicker: [() => "A record", () => "Lightest month", () => "New low"],
    lowestLine: [
      (f) => `${f.spent} is lower than ${previousMonths(f.months)}.`,
      (f) => `Lighter than ${previousMonths(f.months)}.`,
      (f) => `${f.spent}: the lightest month on record.`,
    ],
  },
  closing: {
    kicker: [(f) => `That was ${f.month}`, () => "End of the report", (f) => `${f.month}, in the books`],
    line: [
      (f) => `${f.titleName}. Wear it proudly.`,
      (f) => `This month's title: ${f.titleName}.`,
      (f) => `Officially: ${f.titleName}.`,
    ],
    share: [
      (f) => `My ${f.month} Broke Report: ${f.titleName}.`,
      (f) => `${f.month} verdict: ${f.titleName}. What is yours?`,
      (f) => `Just got my ${f.month} Broke Report. ${f.titleName}.`,
    ],
  },
};
