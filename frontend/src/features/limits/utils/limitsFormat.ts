import { format, isSameDay } from "date-fns";

import type { LimitCounter, LimitsResponse } from "../types";

export const MANUAL_ENTRY_FREE_NOTE = "Manual entry is always free.";

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

/** "3 of 5 left" (counts never go below zero). */
export function formatLeft(counter: LimitCounter): string {
  return `${Math.max(0, counter.remaining)} of ${counter.limit} left`;
}

/** "today at 5:30 PM" or "tomorrow at 5:30 AM" in the device's local time. */
export function formatResetsAt(
  resetsAtIso: string,
  now: Date = new Date(),
): string {
  const at = new Date(resetsAtIso);
  if (Number.isNaN(at.getTime())) {
    return "tomorrow";
  }
  const time = format(at, "h:mm a");
  return isSameDay(at, now) ? `today at ${time}` : `tomorrow at ${time}`;
}

export type CaptureKind = "receipt" | "voice";

export type CaptureAvailability = {
  /** Option should look and act disabled (explains why on tap). */
  blocked: boolean;
  reason: "limit" | "paused" | null;
  /** Small badge for the option, e.g. "7"; null while unknown. */
  badge: string | null;
  /** Caption, e.g. "7 scans left today"; empty while unknown. */
  caption: string;
  /** Toast copy shown when a blocked option is tapped; empty when not blocked. */
  message: string;
};

const CAPTURE_COPY: Record<
  CaptureKind,
  {
    counter: (limits: LimitsResponse) => LimitCounter;
    left: (n: number) => string;
    used: string;
    paused: string;
  }
> = {
  receipt: {
    counter: (limits) => limits.receipt_scans,
    left: (n) => `${n} ${plural(n, "scan", "scans")} left today`,
    used: "receipt scans",
    paused: "Receipt scanning is paused right now.",
  },
  voice: {
    counter: (limits) => limits.voice_captures,
    left: (n) => `${n} ${plural(n, "voice note", "voice notes")} left today`,
    used: "voice notes",
    paused: "Voice capture is paused right now.",
  },
};

const UNKNOWN_AVAILABILITY: CaptureAvailability = {
  blocked: false,
  reason: null,
  badge: null,
  caption: "",
  message: "",
};

/**
 * What the add-transaction menu shows for a receipt/voice option. Unknown limits (still loading
 * or failed) never block: the server stays the authority and answers 429 with its own message.
 */
export function getCaptureAvailability(
  kind: CaptureKind,
  limits: LimitsResponse | undefined,
  now: Date = new Date(),
): CaptureAvailability {
  if (!limits) {
    return UNKNOWN_AVAILABILITY;
  }
  const copy = CAPTURE_COPY[kind];
  const counter = copy.counter(limits);
  const remaining = Math.max(0, counter.remaining);

  if (limits.scanning_paused) {
    return {
      blocked: true,
      reason: "paused",
      badge: null,
      caption: "Paused for now",
      message: `${copy.paused} ${MANUAL_ENTRY_FREE_NOTE}`,
    };
  }
  if (remaining <= 0) {
    return {
      blocked: true,
      reason: "limit",
      badge: "0",
      caption: `No ${copy.used} left today`,
      message: `You've used all ${counter.limit} ${copy.used} for today. Resets ${formatResetsAt(limits.resets_at, now)}. ${MANUAL_ENTRY_FREE_NOTE}`,
    };
  }
  return {
    blocked: false,
    reason: null,
    badge: String(remaining),
    caption: copy.left(remaining),
    message: "",
  };
}

export type AgentAvailability = {
  exhausted: boolean;
  /** "3 of 5 questions left today", or the reset note once used up; empty while unknown. */
  caption: string;
};

export function getAgentAvailability(
  limits: LimitsResponse | undefined,
  now: Date = new Date(),
): AgentAvailability {
  if (!limits) {
    return { exhausted: false, caption: "" };
  }
  const { agent_questions: counter } = limits;
  const remaining = Math.max(0, counter.remaining);
  if (remaining <= 0) {
    return {
      exhausted: true,
      caption: `No questions left today. Resets ${formatResetsAt(limits.resets_at, now)}.`,
    };
  }
  return {
    exhausted: false,
    caption: `${remaining} of ${counter.limit} ${plural(remaining, "question", "questions")} left today`,
  };
}
