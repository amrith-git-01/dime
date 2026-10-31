import { format } from "date-fns";

import { hashString } from "@/features/brokeReport/copy/seed";
import { parseDueDate } from "@/features/recurring/utils/recurringDisplay";
import { isReportRoastLevel, type ReportRoastLevel } from "@/features/settings/types";

import { daysUntilDue } from "./reminderDates";

/**
 * Facts a nudge line is built from, already in plain words. Tone rules for every level: tease the
 * situation, never the person; never shame money or being late; plain English; no emojis.
 */
export type NudgeFacts = {
  /** "Hi Ravi," or "Hi,". */
  hi: string;
  /** "₹800 for Dinner split", or just the title when there is no amount. */
  item: string;
  /** "is due" or "was due". */
  verb: string;
  /** "today", "tomorrow", "in 3 days (15 Nov)", "yesterday", "2 days ago (13 Nov)". */
  timing: string;
};

type Template = (facts: NudgeFacts) => string;
type Variants = readonly [Template, Template, Template, ...Template[]];

export const nudgeVariants: Record<ReportRoastLevel, Variants> = {
  gentle: [
    (f) =>
      `${f.hi} a friendly nudge: ${f.item} ${f.verb} ${f.timing}. If it's already sorted, please ignore this.`,
    (f) =>
      `${f.hi} quick reminder that ${f.item} ${f.verb} ${f.timing}. Whenever you get a moment works for me.`,
    (f) =>
      `${f.hi} hope your week is going well. Just a gentle heads-up: ${f.item} ${f.verb} ${f.timing}. Thank you!`,
  ],
  spicy: [
    (f) => `${f.hi} ${f.item} ${f.verb} ${f.timing}. The UPI app is right there, just saying.`,
    (f) => `${f.hi} not to be dramatic, but ${f.item} ${f.verb} ${f.timing}.`,
    (f) => `${f.hi} friendly reminder with a side of sass: ${f.item} ${f.verb} ${f.timing}.`,
  ],
  savage: [
    (f) =>
      `${f.hi} ${f.item} ${f.verb} ${f.timing}. My patience is fine, my bank balance would like a word.`,
    (f) =>
      `${f.hi} breaking news: ${f.item} ${f.verb} ${f.timing}. Details at 11, payment preferably sooner.`,
    (f) =>
      `${f.hi} this is your official, slightly dramatic notice: ${f.item} ${f.verb} ${f.timing}.`,
  ],
};

/** "₹800" or "₹1,250.50": whole rupees without paise, the way people write them in a chat. */
export function formatShareAmount(amount: string | number): string | null {
  const value = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const whole = Math.round(value * 100) % 100 === 0;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `₹${formatted}`;
}

function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

function dayWord(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

function shortDate(dueDate: string): string {
  const due = parseDueDate(dueDate);
  return due ? format(due, "d MMM") : "";
}

/** When the payment is due, in words: "today", "tomorrow", "in 3 days (15 Nov)", "2 days ago (13 Nov)". */
export function describeTiming(
  dueDate: string,
  today: Date,
): { verb: string; timing: string } {
  const days = daysUntilDue(dueDate, today);
  const date = shortDate(dueDate);
  const withDate = (text: string) => (date ? `${text} (${date})` : text);
  if (days === null) {
    return { verb: "is due", timing: "soon" };
  }
  if (days === 0) {
    return { verb: "is due", timing: "today" };
  }
  if (days === 1) {
    return { verb: "is due", timing: "tomorrow" };
  }
  if (days > 1) {
    return { verb: "is due", timing: withDate(`in ${dayWord(days)}`) };
  }
  if (days === -1) {
    return { verb: "was due", timing: "yesterday" };
  }
  return { verb: "was due", timing: withDate(`${dayWord(-days)} ago`) };
}

export type NudgeInput = {
  level: ReportRoastLevel;
  /** Seeds the pick, so a reminder always nudges in the same words. */
  reminderId: string;
  title: string;
  /** Who owes it; null when the reminder has no name. */
  name: string | null;
  /** Decimal string; null when the reminder has no amount. */
  amount: string | null;
  dueDate: string;
  today: Date;
  /** The `/pay` link; included only when there is one. */
  payLink: string | null;
};

/** The message the Share sheet sends for a "receive" reminder, in the user's chosen tone. */
export function buildNudgeMessage(input: NudgeInput): string {
  const level = isReportRoastLevel(input.level) ? input.level : "spicy";
  const variants = nudgeVariants[level];
  const name = firstName(input.name);
  const money = input.amount === null ? null : formatShareAmount(input.amount);
  const title = input.title.trim() || "this payment";
  const { verb, timing } = describeTiming(input.dueDate, input.today);
  const facts: NudgeFacts = {
    hi: name ? `Hi ${name},` : "Hi,",
    item: money ? `${money} for ${title}` : title,
    verb,
    timing,
  };
  const index = hashString(`${input.reminderId}|nudge`) % variants.length;
  const line = variants[index](facts);
  return input.payLink ? `${line}\n\nPay here: ${input.payLink}` : line;
}
