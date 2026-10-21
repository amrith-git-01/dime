import { TOUR_ORDER, TOURS } from "../constants/tourRegistry";
import type { TourIconSpec } from "../constants/tourIcons";
import type { TourId } from "../constants/tourTypes";

export type TourRowData = {
  id: TourId;
  title: string;
  summary: string;
  /** "~25 s" */
  durationLabel: string;
  icon: TourIconSpec;
  seen: boolean;
};

/** Every tour, in listing order, with whether it was seen (Settings → Tours). */
export function buildTourRows(seen: ReadonlySet<TourId>): TourRowData[] {
  return TOUR_ORDER.map((id) => ({
    id,
    title: TOURS[id].title,
    summary: TOURS[id].summary,
    durationLabel: TOURS[id].durationLabel,
    icon: TOURS[id].icon,
    seen: seen.has(id),
  }));
}

/** "4 of 7 done" for the Settings hub row. */
export function toursProgressLabel(seenCount: number, total: number): string {
  return `${seenCount} of ${total} done`;
}
