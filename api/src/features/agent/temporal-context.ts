import { addDays } from '../../core/timezone';
import { daysInMonth, isoDate, previousMonthOf, resolveTimezone, today, weekdayName } from './dates';

const range = (start: string, end: string) => `${start} → ${end}`;

/** Authoritative NOW block for the agent prompts (so the model never guesses dates). */
export function temporalContextSection(timezone: string | null | undefined, nowMs: number = Date.now()): string {
  const tz = resolveTimezone(timezone);
  const day = today(tz, nowMs);
  const todayIso = isoDate(day);
  const monthStart = { year: day.year, month: day.month, day: 1 };
  const monthEnd = { ...monthStart, day: daysInMonth(day.year, day.month) };
  const prev = previousMonthOf(day);
  const prevStart = { year: prev.year, month: prev.month, day: 1 };
  const prevEnd = { ...prevStart, day: daysInMonth(prev.year, prev.month) };

  return `## NOW (authoritative — do not guess dates)
Today: ${todayIso} (${weekdayName(day)})
Timezone: ${tz}
Today: ${range(todayIso, todayIso)}
Current month (this month): ${range(isoDate(monthStart), isoDate(monthEnd))}
Previous month: ${range(isoDate(prevStart), isoDate(prevEnd))}
Last 7 days: ${range(isoDate(addDays(day, -6)), todayIso)}
Last 30 days: ${range(isoDate(addDays(day, -29)), todayIso)}

Map relative terms to the ranges above (e.g. "previous month" = Previous month).
Never infer dates from model training knowledge.
`;
}

export function prependTemporalContext(system: string, timezone: string | null | undefined, nowMs?: number): string {
  return `${temporalContextSection(timezone, nowMs)}\n${system}`;
}
