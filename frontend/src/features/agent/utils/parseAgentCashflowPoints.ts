import { format, parseISO } from "date-fns";

export type AgentCashflowPoint = {
  date: string;
  amount: number;
};

export type AgentCashflowDay = {
  date: string;
  amount: number;
  label: string;
};

/** Day + month for every cashflow bar (e.g. "14 May"). */
export function formatAgentCashflowXLabel(date: string): string {
  return format(parseISO(date), "d MMM");
}

export function parseAgentCashflowPoints(
  points: AgentCashflowPoint[],
): AgentCashflowDay[] {
  return points
    .filter(
      (point) =>
        point.date.trim().length > 0 &&
        Number.isFinite(point.amount) &&
        point.amount >= 0,
    )
    .map((point) => {
      const date = point.date.trim();
      return {
        date,
        amount: point.amount,
        label: formatAgentCashflowXLabel(date),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
