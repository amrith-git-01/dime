import type { ResolvedCopy } from "../copy";
import { count } from "../copy/seed";
import type { ReportSlideId, ReportSnapshot } from "../types";
import {
  formatDayMonth,
  formatFullAmount,
  formatPercent,
  monthName,
  weekdayName,
} from "./reportFormat";

/**
 * What a screen reader reads for a slide: the same story as the picture, with full rupee values
 * instead of the compact ones ("₹ 18,620", not "₹18.6k").
 */
export function slideAccessibilityLabel(
  id: ReportSlideId,
  snapshot: ReportSnapshot,
  copy: ResolvedCopy,
): string {
  switch (id) {
    case "cover":
      return [
        `${monthName(snapshot.month)} ${snapshot.year} Broke Report.`,
        `${copy.title.name}.`,
        copy.title.tagline,
        copy.sparseNote ?? "",
      ]
        .filter(Boolean)
        .join(" ");

    case "damage":
      return [
        `${copy.damage.kicker} ${formatFullAmount(snapshot.spent)}.`,
        copy.damage.line,
        copy.damage.chip ? `${copy.damage.chip}.` : "",
      ]
        .filter(Boolean)
        .join(" ");

    case "lineup": {
      const rows = snapshot.categories
        .map(
          (category, index) =>
            `${index + 1}. ${category.name}, ${formatPercent(category.share)}, ${formatFullAmount(category.amount)}`,
        )
        .join(". ");
      return `${copy.lineup.kicker}. ${copy.lineup.line} ${rows}.`;
    }

    case "regular": {
      const payee = snapshot.top_payee;
      return [
        copy.regular?.kicker ?? "",
        copy.regular?.line ?? "",
        payee
          ? `${payee.display_name}: ${count(payee.count, "visit")}, ${formatFullAmount(payee.amount)}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    case "moment": {
      const parts: string[] = [];
      if (snapshot.biggest_spend && copy.moment.biggest) {
        parts.push(
          `${copy.moment.biggest.kicker}: ${formatFullAmount(snapshot.biggest_spend.amount)}.`,
          copy.moment.biggest.line,
        );
      }
      if (snapshot.busiest_day && copy.moment.busiest) {
        parts.push(
          `${copy.moment.busiest.kicker}: ${formatDayMonth(snapshot.busiest_day.date)}, ${formatFullAmount(snapshot.busiest_day.amount)}.`,
          copy.moment.busiest.line,
        );
      }
      return parts.join(" ");
    }

    case "rhythm":
      return [
        `${copy.rhythm.kicker}.`,
        copy.rhythm.line,
        copy.rhythm.weekendLine,
        copy.rhythm.calmLine ?? "",
        `Busiest weekday: ${weekdayName(snapshot.weekday.peak_index)}.`,
      ]
        .filter(Boolean)
        .join(" ");

    case "win":
      return copy.win ? `${copy.win.kicker}. ${copy.win.line}` : "";

    case "closing":
      return `${copy.closing.kicker}. ${copy.closing.line} ${copy.title.tagline}`;
  }
}
