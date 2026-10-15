/**
 * Sample rows carry ids with this prefix so they are recognisable anywhere they might leak
 * (a cache dump, a log, a test). Real ids are random UUIDs and never start with it.
 */
export const TOUR_SAMPLE_ID_PREFIX = "5a3b1e00-";

/** A stable, UUID-shaped sample id for sample row number `n`. */
export function tourSampleId(n: number): string {
  return `${TOUR_SAMPLE_ID_PREFIX}0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export function isTourSampleId(value: string): boolean {
  return value.startsWith(TOUR_SAMPLE_ID_PREFIX);
}
