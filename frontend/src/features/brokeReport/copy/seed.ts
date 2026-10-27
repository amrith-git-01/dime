import type { Variants } from "./types";

/** FNV-1a: small, stable across runs and devices, no dependency. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Picks one variant for a slot. The seed is the report's period key (user independent) and the
 * slot name, so the same report always reads the same, and the slots of one report do not all
 * land on the same index.
 */
export function pickVariant<F>(
  variants: Variants<F>,
  facts: F,
  seed: string,
  slot: string,
): string {
  const index = hashString(`${seed}|${slot}`) % variants.length;
  return variants[index](facts);
}

/** "1 payment", "9 payments". */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** " Longest run: 3 days." for a streak, and nothing for no streak (never "a best run of 0"). */
export function runClause(streak: number, lead = " Longest run: "): string {
  return streak > 0 ? `${lead}${count(streak, "day")}.` : "";
}

/** "the month before", "the 3 months before": the months a record was compared with. */
export function previousMonths(n: number): string {
  return n === 1 ? "the month before" : `the ${n} months before`;
}

const PAYEE_PROBE = "\u0001payee\u0001";

/**
 * Like `pickVariant`, for a line that may be shared as a picture: the result never contains the
 * payee name. The normal pick is used when it is already nameless; otherwise one of the nameless
 * variants is picked the same way (and when there are none, the name becomes "your usual spot").
 */
export function pickNamelessVariant<F extends { payee: string }>(
  variants: Variants<F>,
  facts: F,
  seed: string,
  slot: string,
): string {
  const probe = { ...facts, payee: PAYEE_PROBE };
  const names = (variant: Variants<F>[number]) => variant(probe).includes(PAYEE_PROBE);
  const hash = hashString(`${seed}|${slot}`);
  if (!names(variants[hash % variants.length])) {
    return pickVariant(variants, facts, seed, slot);
  }
  const nameless = variants.filter((variant) => !names(variant));
  if (nameless.length === 0) {
    return pickVariant(variants, { ...facts, payee: "your usual spot" }, seed, slot);
  }
  return nameless[hash % nameless.length](facts);
}
