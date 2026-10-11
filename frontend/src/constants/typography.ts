/**
 * Typography tokens — Dime Monochrome Design System.
 *
 * 4-step hierarchy per screen, one hero element per screen maximum:
 *   Step 1 Hero:    ~42sp, weight 700 — ONE per screen (monthly amount, etc.)
 *   Step 2 Primary: ~24-28sp, weight 600-700 — section titles, primary amounts
 *   Step 3 Body:    ~15-16sp, weight 450-600 — row content, body text
 *   Step 4 Caption: ~11-12sp, weight 450-600, often uppercase — labels, timestamps
 *
 * All monetary values use fontVariant: ['tabular-nums'] for alignment.
 * One font family (Hanken Grotesk) for everything — no mono fallback.
 *
 * @see docs/design-system.md §2
 */
import type { TextStyle } from "react-native";
import { accent, ink, inkFaint, inkSoft } from "./colors";
import { fontFamilies } from "./fonts";

export const tabularNums: TextStyle["fontVariant"] = ["tabular-nums"];

// ─── Step 1 — Hero ────────────────────────────────────────────────────────────

/** The one large number per screen — monthly remaining, daily total, etc. */
export const hero = {
  fontFamily: fontFamilies.bold,
  fontSize: 42,
  lineHeight: 50,
  letterSpacing: -0.02 * 42,
  fontVariant: tabularNums,
} as const;

/** Large section amount — budget remaining, analytics total. */
export const heroSecondary = {
  fontFamily: fontFamilies.bold,
  fontSize: 32,
  lineHeight: 40,
  letterSpacing: -0.02 * 32,
  fontVariant: tabularNums,
} as const;

// ─── Step 2 — Primary ────────────────────────────────────────────────────────

export const h1 = {
  fontFamily: fontFamilies.semiBold,
  fontSize: 28,
  lineHeight: 36,
  letterSpacing: -0.01 * 28,
  color: ink,
} as const;

export const h2 = {
  fontFamily: fontFamilies.semiBold,
  fontSize: 22,
  lineHeight: 28,
  letterSpacing: -0.01 * 22,
  color: ink,
} as const;

/** Row amount — transaction list, category list. */
export const amountLg = {
  fontFamily: fontFamilies.semiBold,
  fontSize: 18,
  lineHeight: 24,
  fontVariant: tabularNums,
  color: accent,
} as const;

// ─── Step 3 — Body ───────────────────────────────────────────────────────────

export const bodyLg = {
  fontFamily: fontFamilies.medium,
  fontSize: 16,
  lineHeight: 24,
  color: ink,
} as const;

/** Tab screen list section title — "Top categories", "All categories", etc. */
export const sectionHeaderTitle = {
  fontFamily: fontFamilies.semiBold,
  fontSize: 16,
  lineHeight: 22,
  color: ink,
} as const;

export const bodyMd = {
  fontFamily: fontFamilies.regular,
  fontSize: 15,
  lineHeight: 22,
  color: ink,
} as const;

/** Row merchant name, category name — the primary label in a list row. */
export const rowPrimary = {
  fontFamily: fontFamilies.medium,
  fontSize: 15,
  lineHeight: 20,
  color: ink,
} as const;

/** Row subtitle — "Category · HH:MM" line. */
export const rowSecondary = {
  fontFamily: fontFamilies.regular,
  fontSize: 12,
  lineHeight: 16,
  color: inkSoft,
} as const;

/** Compact amount in rows. */
export const amountMd = {
  fontFamily: fontFamilies.semiBold,
  fontSize: 15,
  lineHeight: 20,
  fontVariant: tabularNums,
} as const;

// ─── Step 4 — Caption / Label ────────────────────────────────────────────────

export const caption = {
  fontFamily: fontFamilies.regular,
  fontSize: 12,
  lineHeight: 16,
  color: inkSoft,
} as const;

export const captionFaint = {
  fontFamily: fontFamilies.regular,
  fontSize: 12,
  lineHeight: 16,
  color: inkFaint,
} as const;

/** Uppercase section eyebrow — "THIS MONTH", "SPENT", "NET", etc. */
export const eyebrow = {
  fontFamily: fontFamilies.medium,
  fontSize: 11,
  lineHeight: 14,
  letterSpacing: 0.06 * 11,
  textTransform: "uppercase" as const,
  color: inkFaint,
} as const;

/** Tab bar label. */
export const tabLabel = {
  fontFamily: fontFamilies.medium,
  fontSize: 10,
  lineHeight: 13,
  letterSpacing: 0.02,
} as const;

// ─── Convenience screen/component styles ─────────────────────────────────────

export const typography = {
  // ─ Hero
  hero,
  heroSecondary,

  // ─ Step 2
  h1,
  h2,
  amountLg,

  // ─ Step 3
  bodyLg,
  sectionHeaderTitle,
  bodyMd,
  rowPrimary,
  rowSecondary,
  amountMd,

  // ─ Step 4
  caption,
  captionFaint,
  eyebrow,
  tabLabel,

  // ─── Legacy aliases (kept for migration, will be removed) ────────────────
  screenTitle: h1,
  screenSubtitle: { ...bodyMd, color: inkSoft },
  sectionTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 18,
    color: ink,
  },
  cardTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: ink,
  },
  cardBody: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: inkSoft,
  },
  emptyHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: inkFaint,
  },
  emptyBody: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
  },
  linkSmall: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: accent,
  },
  mono: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: ink,
  },
  monoEmphasis: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: ink,
  },

  headerDisplayName: h2,
  headerGreetingOnPrimary: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
  },
  headerDisplayNameOnPrimary: h2,
  headerGreetingLine: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
  },
  headerUsernameLine: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: ink,
  },

  // Bento aliases
  bentoAmountHero: {
    fontFamily: fontFamilies.bold,
    fontSize: 28,
    lineHeight: 34,
    color: ink,
  },
  bentoAmount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 22,
    lineHeight: 28,
    color: ink,
  },
  bentoAmountCompact: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: ink,
  },
  bentoLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
  },
  bentoSubtext: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: inkFaint,
  },

  transactionList: {
    merchant: rowPrimary,
    time: rowSecondary,
    via: {
      fontFamily: fontFamilies.regular,
      fontSize: 11,
      lineHeight: 14,
      color: inkSoft,
    },
    categoryTag: {
      fontFamily: fontFamilies.medium,
      fontSize: 10,
      lineHeight: 13,
      color: ink,
    },
    tagSeparator: {
      fontFamily: fontFamilies.regular,
      fontSize: 11,
      lineHeight: 14,
      color: inkSoft,
    },
    amount: amountMd,
  },
} as const;
