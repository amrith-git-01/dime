import { count, previousMonths, runClause } from "./seed";
import type { LevelCopy } from "./types";

/** Gentle: warm and encouraging. Notices things and celebrates them. */
export const gentleCopy: LevelCopy = {
  titles: {
    one_big_splurge: {
      name: "The Big-Moment Maker",
      tagline: [
        (f) => `One special purchase stood out in ${f.month}.`,
        () => "Some months have one big moment, and that is fine.",
        () => "A single big spend, and the rest stayed calm.",
      ],
    },
    loyalist: {
      name: "The Loyal Regular",
      tagline: [
        (f) => `You went to ${f.payee} ${count(f.visits, "time")}. Good places are worth returning to.`,
        () => "You know what you like, and you stick with it.",
        () => "Familiar places, familiar comforts.",
      ],
    },
    weekend_warrior: {
      name: "The Weekend Enjoyer",
      tagline: [
        (f) => `${f.weekendPct}% of your spending happened on weekends.`,
        () => "Your weekends are for living a little.",
        () => "You save the good times for the weekend.",
      ],
    },
    payday_sprinter: {
      name: "The Fresh-Start Spender",
      tagline: [
        (f) => `${f.firstWeekPct}% of the month went out in the first week.`,
        () => "You take care of things early in the month.",
        () => "A busy first week, then a calmer rest of the month.",
      ],
    },
    thousand_cuts: {
      name: "The Small-Stuff Collector",
      tagline: [
        (f) => `${count(f.debits, "small payment")}, each one easy to forget.`,
        () => "Lots of little payments make up your month.",
        () => "Small things add up, and now you can see them.",
      ],
    },
    ghost: {
      name: "The Quiet Spender",
      tagline: [
        (f) => `${count(f.noSpendDays, "day")} without spending anything.`,
        () => "Plenty of calm days in this month.",
        () => "Your wallet had lots of time to rest.",
      ],
    },
    steady: {
      name: "The Steady Hand",
      tagline: [
        () => "A smooth, even month with no surprises.",
        (f) => `${f.month} was steady from start to finish.`,
        () => "Nothing dramatic, and that is a good thing.",
      ],
    },
  },
  sparse: {
    note: [
      (f) => `${count(f.debits, "payment")} this month, so this one is short and sweet.`,
      (f) => `A quiet ${f.month}. Here is a quick look.`,
      (f) => `Not many payments in ${f.month}, so we kept it brief.`,
    ],
  },
  cover: {
    kicker: [
      (f) => `Your ${f.month} Broke Report`,
      (f) => `A look back at ${f.month}`,
      (f) => `${f.month}, in a few slides`,
    ],
    line: [
      () => "A friendly look at how your wallet did.",
      () => "Take a minute to see where it all went.",
      () => "Here is your month, nice and simple.",
    ],
  },
  damage: {
    kicker: [
      (f) => `In ${f.month} you spent`,
      (f) => `Your ${f.month} total`,
      (f) => `${f.month} came to`,
    ],
    line: [
      (f) => `Across ${count(f.debits, "payment")}.`,
      (f) => `That is ${count(f.debits, "payment")} in all.`,
      (f) => `${count(f.debits, "payment")}, each one tracked.`,
    ],
    chipUp: [
      (f) => `${f.delta} more than usual`,
      (f) => `A little higher: up ${f.delta}`,
      (f) => `${f.delta} above your usual month`,
    ],
    chipDown: [
      (f) => `${f.delta} less than usual`,
      (f) => `Nicely lower: down ${f.delta}`,
      (f) => `${f.delta} below your usual month`,
    ],
    chipSame: [
      () => "Right on your usual",
      () => "About the same as usual",
      () => "A very normal month",
    ],
  },
  lineup: {
    kicker: [() => "Where it went", () => "Your top categories", () => "The big picture"],
    line: [
      (f) => `${f.top} took the biggest share: ${f.topPct}%.`,
      (f) => `${f.topPct}% of your month went to ${f.top}.`,
      (f) => `${f.top} led the way at ${f.topPct}%.`,
    ],
  },
  regular: {
    kicker: [() => "Your regular spot", () => "Most visited", () => "A familiar face"],
    line: [
      (f) => `That is ${f.total} in total.`,
      (f) => `You came back to ${f.payee} ${count(f.visits, "time")}.`,
      (f) => `${f.payee} added up to ${f.total}.`,
    ],
  },
  moment: {
    biggestKicker: [() => "Your biggest spend", () => "The big one", () => "Your largest payment"],
    biggestLine: [
      (f) => `${f.name} on ${f.date}, in ${f.category}.`,
      (f) => `On ${f.date}: ${f.name} (${f.category}).`,
      (f) => `${f.date} was the day for ${f.name}.`,
    ],
    busiestKicker: [() => "Your busiest day", () => "A full day", () => "The most active day"],
    busiestLine: [
      (f) => `${f.busyDate}: ${count(f.busyCount, "payment")}, ${f.busyAmount} in all.`,
      (f) => `On ${f.busyDate} you made ${count(f.busyCount, "payment")} totalling ${f.busyAmount}.`,
      (f) => `${f.busyDate} had the most going on: ${f.busyAmount}.`,
    ],
  },
  rhythm: {
    kicker: [() => "Your spending rhythm", () => "Your week at a glance", () => "How your week flows"],
    line: [
      (f) => `${f.peakDay} is your busiest day.`,
      (f) => `Most of your spending lands on ${f.peakDay}s.`,
      (f) => `${f.peakDay} stands out in your week.`,
    ],
    weekendLine: [
      (f) => `${f.weekendPct}% of your spending was on weekends.`,
      (f) => `Weekends made up ${f.weekendPct}%.`,
      (f) => `${f.weekendPct}% happened on a Saturday or Sunday.`,
    ],
    calmLine: [
      (f) => `${count(f.noSpendDays, "no-spend day")}.${runClause(f.streak, " Longest run: ")}`,
      (f) => `${count(f.noSpendDays, "calm day")} this month.${runClause(f.streak, " Best run: ")}`,
      (f) => `You had ${count(f.noSpendDays, "day")} with no spending.${runClause(f.streak, " Longest streak: ")}`,
    ],
  },
  win: {
    categoryKicker: [() => "A win to celebrate", () => "Well done", () => "Something to be proud of"],
    categoryLine: [
      (f) => `You spent ${f.delta} less on ${f.category} than usual.`,
      (f) => `${f.category} came in ${f.delta} under your usual.`,
      (f) => `${f.category} is down ${f.delta}. That takes effort.`,
    ],
    streakKicker: [() => "A calm stretch", () => "A streak to celebrate", () => "Taking a breather"],
    streakLine: [
      (f) => `${count(f.days, "day")} in a row with no spending (${f.start} to ${f.end}).`,
      (f) => `From ${f.start} to ${f.end}, ${count(f.days, "day")} with nothing spent.`,
      (f) => `${count(f.days, "calm day")} in a row. Lovely.`,
    ],
    lowestKicker: [() => "Your lightest month", () => "A new best", () => "Worth celebrating"],
    lowestLine: [
      (f) => `${f.spent} is lower than ${previousMonths(f.months)}.`,
      (f) => `A lighter month than ${previousMonths(f.months)}.`,
      (f) => `${f.spent}, the lowest so far. Well done.`,
    ],
  },
  closing: {
    kicker: [(f) => `That was ${f.month}`, () => "That is your report", (f) => `${f.month}, wrapped up`],
    line: [
      (f) => `This month you were ${f.titleName}.`,
      (f) => `Your title: ${f.titleName}.`,
      (f) => `Thanks for looking back. You are ${f.titleName}.`,
    ],
    share: [
      (f) => `My ${f.month} Broke Report: ${f.titleName}.`,
      (f) => `Looking back at ${f.month}: ${f.titleName}.`,
      (f) => `My ${f.month} wallet recap. ${f.titleName}.`,
    ],
  },
};
