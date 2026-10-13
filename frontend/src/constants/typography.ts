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
import { fontFamilies } from "./fonts";

export const tabularNums: TextStyle["fontVariant"] = ["tabular-nums"];

export type TypographyColors = {
  ink: string;
  inkSoft: string;
  inkFaint: string;
  /** Accent used as text (links, selected labels). */
  accentText: string;
};

/**
 * Builds the typography presets for one palette. The theme calls this once per scheme and
 * hands the frozen result to `createThemedStyles` as `typography`, so text colors follow the
 * scheme without any per-component work.
 */
export function createTypography({
  ink,
  inkSoft,
  inkFaint,
  accentText,
}: TypographyColors) {
  // ─── Step 1 — Hero ────────────────────────────────────────────────────────────

  /** The one large number per screen — monthly remaining, daily total, etc. */
  const hero = {
    fontFamily: fontFamilies.bold,
    fontSize: 42,
    lineHeight: 50,
    letterSpacing: -0.02 * 42,
    fontVariant: tabularNums,
  } as const;

  /** Large section amount — budget remaining, analytics total. */
  const heroSecondary = {
    fontFamily: fontFamilies.bold,
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.02 * 32,
    fontVariant: tabularNums,
  } as const;

  // ─── Step 2 — Primary ────────────────────────────────────────────────────────

  const h1 = {
    fontFamily: fontFamilies.semiBold,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.01 * 28,
    color: ink,
  } as const;

  const h2 = {
    fontFamily: fontFamilies.semiBold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.01 * 22,
    color: ink,
  } as const;

  /** Row amount — transaction list, category list. */
  const amountLg = {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    fontVariant: tabularNums,
    color: accentText,
  } as const;

  // ─── Step 3 — Body ───────────────────────────────────────────────────────────

  const bodyLg = {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 24,
    color: ink,
  } as const;

  /** Tab screen list section title — "Top categories", "All categories", etc. */
  const sectionHeaderTitle = {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: ink,
  } as const;

  const bodyMd = {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: ink,
  } as const;

  /** Row merchant name, category name — the primary label in a list row. */
  const rowPrimary = {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: ink,
  } as const;

  /** Row subtitle — "Category · HH:MM" line. */
  const rowSecondary = {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
  } as const;

  /** Compact amount in rows. */
  const amountMd = {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: tabularNums,
  } as const;

  // ─── Step 4 — Caption / Label ────────────────────────────────────────────────

  const caption = {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
  } as const;

  const captionFaint = {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkFaint,
  } as const;

  /** Uppercase section eyebrow — "THIS MONTH", "SPENT", "NET", etc. */
  const eyebrow = {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.06 * 11,
    textTransform: "uppercase" as const,
    color: inkFaint,
  } as const;

  /** Tab bar label. */
  const tabLabel = {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.02,
  } as const;

  // ─── Convenience screen/component styles ─────────────────────────────────────

  const typography = {
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
      color: accentText,
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

    return typography;
}

export type Typography = ReturnType<typeof createTypography>;
