# Visual Design System — Monochrome Neutral + Single Indigo Accent

> Portable extract from the Dime production app (React Native / Expo), written so it can be reused on **web**.
> Light mode only. Restraint is the aesthetic: color is earned, not decorative.
>
> **Source of truth for this file:** shipped tokens in `frontend/src/constants/*`, not the older prose in `docs/design-system.md` (that doc still mentions Schibsted Grotesk / 44sp / radius 16–20–28; the app ships Hanken Grotesk / 42sp / radius 10–16–24–32).

---

## North-star rule

> If you are not showing money or an alert, you do not get color.
> Everything else is ink, gray, and white.

The indigo accent appears only on:

1. Monetary amounts
2. Primary actions (CTA, FAB)
3. Selected / active / focus states
4. Progress fills

Never as a header gradient, tab-bar fill, or decorative card background. Hierarchy is **size + weight**, not color.

---

## Table of contents

1. [Color](#1-color)
2. [Typography](#2-typography)
3. [Spacing and layout](#3-spacing-and-layout)
4. [Radius](#4-radius)
5. [Elevation](#5-elevation)
6. [Iconography](#6-iconography)
7. [Motion and animation](#7-motion-and-animation)
8. [Haptics](#8-haptics)
9. [Component patterns](#9-component-patterns)
10. [Visual hierarchy](#10-visual-hierarchy)
11. [Copy and chrome](#11-copy-and-chrome)
12. [Hard rules](#12-hard-rules)
13. [Web adaptations](#13-web-adaptations)
14. [CSS starter](#14-css-starter)

---

## 1. Color

### 1.1 Core neutrals

| Token           | Hex       | Use                                                                         |
| --------------- | --------- | --------------------------------------------------------------------------- |
| `paper`         | `#FAFAFA` | Page background. True near-white. **No tint.**                              |
| `surface`       | `#FFFFFF` | Cards, sheets, inputs. Elevation via shadow only.                           |
| `surfaceSunken` | `#F1F1F3` | Progress tracks, skeleton base, pressed wells, icon wells                   |
| `line`          | `#EAEAEC` | **Only** border color. Hairline **internal** dividers. Never card outlines. |
| `ink`           | `#14151A` | Primary text, headings, default icons                                       |
| `inkSoft`       | `#5B5D68` | Secondary text, captions, timestamps, inactive labels                       |
| `inkFaint`      | `#A0A2AD` | Placeholders, disabled, eyebrows, tertiary chrome                           |

`line` is for rows **inside** a card. The card itself has **zero** outer border.

### 1.2 Accent (one hue)

| Token         | Value                     | Use                                                                         |
| ------------- | ------------------------- | --------------------------------------------------------------------------- |
| `accent`      | `#2B3FE0`                 | Debits / neutral money, primary CTA, selected tab/day, progress fill, focus |
| `accentTint`  | `rgba(43, 63, 224, 0.08)` | Chip / selected-row wash                                                    |
| `accentHeat1` | `rgba(43, 63, 224, 0.12)` | Low heatmap                                                                 |
| `accentHeat2` | `rgba(43, 63, 224, 0.28)` | Mid heatmap                                                                 |
| `accentHeat3` | `rgba(43, 63, 224, 0.60)` | High heatmap — **white text required**                                      |
| `accentDeep`  | `#1C2BB0`                 | Pressed accent fill (optional; opacity `0.92` on press also works)          |

On-accent text: `#FFFFFF`. Muted on-accent: `rgba(255,255,255,0.88)`. Hairline on accent: `rgba(255,255,255,0.22)`.

### 1.3 Semantic (text + small badges only)

Never large fills. Never headers.

| Token         | Hex                        | Use                               |
| ------------- | -------------------------- | --------------------------------- |
| `success`     | `#1A8754`                  | Credits, income, positive net     |
| `successTint` | `rgba(26, 135, 84, 0.08)`  | Credit chip / row wash            |
| `danger`      | `#D6394A`                  | Over budget, delete, negative net |
| `dangerTint`  | `rgba(214, 57, 74, 0.08)`  | Swipe-delete / destructive wash   |
| `warning`     | `#B5790A`                  | ~80% threshold                    |
| `warningTint` | `rgba(181, 121, 10, 0.08)` | Near-limit wash                   |

Toast accents when more contrast is needed: error `#B42318`, warning `#B54708`.

### 1.4 Overlays

| Token                     | Value                     | Use                        |
| ------------------------- | ------------------------- | -------------------------- |
| `overlays.scrim`          | `rgba(0,0,0,0.35)`        | Modal                      |
| `overlays.scrimHeavy`     | `rgba(0,0,0,0.55)`        | Image viewer / heavy modal |
| `overlays.scrimLight`     | `rgba(20, 21, 26, 0.22)`  | Light dim                  |
| `overlays.backdrop`       | `rgba(20, 21, 26, 0.12)`  | Tooltip / light sheet      |
| `overlays.avatarFallback` | `rgba(43, 63, 224, 0.12)` | Avatar placeholder         |

### 1.5 Skeleton

| Token                | Hex                         |
| -------------------- | --------------------------- |
| `skeleton.surface`   | `#EAEAEC`                   |
| `skeleton.onSurface` | `#D4D4D8` (pulse highlight) |

Pulse: **800ms**, opacity **0.45 → 1.0**, loop. Neutral gray — never purple-tinted.

### 1.6 Charts

| Token                  | Value                     | Use              |
| ---------------------- | ------------------------- | ---------------- |
| `charts.tooltipScrim`  | `rgba(20, 21, 26, 0.06)`  | Tooltip wash     |
| `charts.netSurplusBar` | `rgba(26, 135, 84, 0.32)` | Positive net bar |
| `charts.netDeficitBar` | `rgba(214, 57, 74, 0.32)` | Negative net bar |

**Donut / share charts (preferred, monochrome)** — single-hue opacity ladder on `accent`:

`100% → 72% → 50% → 32% → 18%`, then “Other” = `skeleton.onSurface` (`#D4D4D8`).

**Multi-series only when slices must be distinct:**

`#0D9488`, `#EA580C`, `#DB2777`, `#0284C7`, `#CA8A04`, `#059669`, other `#9CA3AF`.

Prefer the monochrome ladder. Multi-hue is the exception.

### 1.7 Category marks (only multi-color surface)

Icon tile: **~8% tint fill** + **full-strength stroke icon**. Never a large category-colored card.

Formula: append hex alpha `14` (~8%) to the mark, e.g. `#E0594A` → `#E0594A14`. Fallback uncategorized: `#94A3B8` (muted tile `rgba(148,163,184,0.14)`).

Preset picker:

```
#FF6B6B  #4ECDC4  #A855F7  #4ADE80  #FB923C  #FBBF24
#818CF8  #F472B6  #34D399  #94A3B8  #2B3FE0  #EF4444
#0EA5E9  #14B8A6  #84CC16  #EC4899  #6366F1  #78716C
```

Saturated mark names (legacy):

| Name     | Hex       |
| -------- | --------- |
| lavender | `#8B7FF5` |
| mint     | `#4ADE80` |
| sky      | `#38BDF8` |
| coral    | `#FF6B6B` |
| peach    | `#FB923C` |
| teal     | `#4ECDC4` |
| indigo   | `#818CF8` |
| rose     | `#F472B6` |

Type **on** a saturated tile: white / `rgba(255,255,255,0.85)` / `0.65`. Type on pastel/neutral: the ink ladder.

### 1.8 Misc (functional, not decorative)

| Token                      | Hex       | Use                                              |
| -------------------------- | --------- | ------------------------------------------------ |
| `iconAccentSky`            | `#0284C7` | Rare settings icon accent                        |
| `iconAccentOrange`         | `#EA580C` | Rare settings icon accent                        |
| `oauthGoogle`              | `#4285F4` | Google brand only                                |
| `onboardingIllustrationBg` | `#F7EFE1` | Onboarding postcard paper                        |
| `shadow`                   | `#000000` | Shadow color (opacity lives in elevation tokens) |

---

## 2. Typography

### 2.1 Typeface

**One geometric grotesk everywhere: Hanken Grotesk.**

| Weight       | CSS / RN PostScript                             |
| ------------ | ----------------------------------------------- |
| 400 Regular  | `"Hanken Grotesk"` / `HankenGrotesk_400Regular` |
| 500 Medium   | `HankenGrotesk_500Medium`                       |
| 600 SemiBold | `HankenGrotesk_600SemiBold`                     |
| 700 Bold     | `HankenGrotesk_700Bold`                         |

Google Fonts: [Hanken Grotesk](https://fonts.google.com/specimen/Hanken+Grotesk).

**No second font.** No Inter. No mono for money.

**Tabular figures on every number:** CSS `font-variant-numeric: tabular-nums;` (OpenType `tnum`). Amounts, dates, percents, chart axes.

Display tracking: about **-2% of font size** (hero 42 → `-0.84px`).

### 2.2 Four-step visual hierarchy

Every screen / view maps content to **exactly these four steps**. Never in-between. Never two Step-1s.

| Step              | Role                                          | Size / weight         | How many        |
| ----------------- | --------------------------------------------- | --------------------- | --------------- |
| **1 — Hero**      | The one thing the view exists to show         | ~42px / 700 / tabular | **Exactly one** |
| **2 — Primary**   | Page title, primary amounts                   | 22–28px / 600–700     | A handful       |
| **3 — Secondary** | Section titles, row labels, body, row amounts | 15–18px / 400–600     | Most structure  |
| **4 — Tertiary**  | Eyebrows, captions, timestamps, chrome        | 10–12px / 400–500     | Most numerous   |

**Weight, not color, carries importance.** Accent marks “this is money or actionable,” not “this is the important one.”

If a view jumps from Step 1 to Step 4 with nothing in between, hierarchy is broken.

### 2.3 Type scale (shipped)

| Token                | Size | Line | Weight | Tracking | Color          | Variant       | Use                                               |
| -------------------- | ---- | ---- | ------ | -------- | -------------- | ------------- | ------------------------------------------------- |
| `hero`               | 42   | 50   | 700    | -2%      | amount color   | tabular       | **One** hero number per view                      |
| `heroSecondary`      | 32   | 40   | 700    | -2%      |                | tabular       | Large section amount (must not compete with hero) |
| `h1`                 | 28   | 36   | 600    | -1%      | ink            |               | Screen / page titles                              |
| `h2`                 | 22   | 28   | 600    | -1%      | ink            |               | Large titles, header name                         |
| `amountLg`           | 18   | 24   | 600    |          | accent default | tabular       | Card / list primary amounts                       |
| `bodyLg`             | 16   | 24   | 500    |          | ink            |               | Primary readable copy                             |
| `sectionHeaderTitle` | 16   | 22   | 600    |          | ink            |               | Section titles                                    |
| `bodyMd`             | 15   | 22   | 400    |          | ink            |               | Body                                              |
| `rowPrimary`         | 15   | 20   | 500    |          | ink            |               | Merchant / category name                          |
| `amountMd`           | 15   | 20   | 600    |          |                | tabular       | Compact row amount                                |
| `rowSecondary`       | 12   | 16   | 400    |          | inkSoft        |               | Subtitle line                                     |
| `caption`            | 12   | 16   | 400    |          | inkSoft        |               | Metadata                                          |
| `captionFaint`       | 12   | 16   | 400    |          | inkFaint       |               | Disabled / hint                                   |
| `eyebrow`            | 11   | 14   | 500    | +6%      | inkFaint       | **uppercase** | `THIS MONTH`, `BUDGET`                            |
| `tabLabel`           | 10   | 13   | 500    | +0.02em  |                |               | Nav labels                                        |

**Bento aliases**

| Token                | Size / line / weight    |
| -------------------- | ----------------------- |
| `bentoAmountHero`    | 28 / 34 / 700           |
| `bentoAmount`        | 22 / 28 / 600           |
| `bentoAmountCompact` | 18 / 24 / 600           |
| `bentoLabel`         | 13 / 18 / 500, inkSoft  |
| `bentoSubtext`       | 11 / 15 / 400, inkFaint |

**Card / empty / chrome**

| Token            | Size / line / weight / color |
| ---------------- | ---------------------------- |
| `cardTitle`      | 18 / 24 / 600 / ink          |
| `cardBody`       | 14 / 20 / 400 / inkSoft      |
| `emptyHint`      | 14 / 20 / 400 / inkFaint     |
| `emptyBody`      | 13 / 18 / 400 / inkSoft      |
| `linkSmall`      | 12 / 16 / 400 / accent       |
| `headerGreeting` | 12 / 16 / 400 / inkSoft      |
| `headerUsername` | 18 / 24 / 600 / ink          |

**Transaction / list row**

- Primary label: `rowPrimary`
- Time / via: 11–12 / inkSoft
- Category tag: 10 / 500 / ink
- Amount: `amountMd` tabular; **debit = accent**, **credit = success**, text only (no colored amount chips)

### 2.4 Amount color rules

| State                      | Color                                      |
| -------------------------- | ------------------------------------------ |
| Debit / spend (in budget)  | `accent`                                   |
| Credit / income            | `success`                                  |
| Negative net / over budget | `danger`                                   |
| Neutral zero               | `accent` (or ink if not money)             |
| No income tracked          | show spend in `accent`, not signed red net |

Currency: `₹` + narrow no-break space (`U+202F`) + Indian grouping. Compact heroes: whole rupees, no paise. Net: `+₹ 1,200` / `-₹ 800`; zero unsigned.

---

## 3. Spacing and layout

**4px base.** Treat RN `dp` as `px` at 1x.

| Token | px  | Typical                                       |
| ----- | --- | --------------------------------------------- |
| `xs`  | 4   | Tight gaps                                    |
| `sm`  | 8   | Compact gap, icon padding                     |
| `md`  | 12  | Field padding, inner clusters                 |
| `lg`  | 16  | Page horizontal padding, card inner, tile gap |
| `xl`  | 24  | Section gap, generous card padding            |

Also (mobile shell): tab bar height 48, tab icon 22.

**Page content (mobile):** padding 16 / 16 / 48 (extra bottom was for a tab bar — drop the 48 on web).

**Bento / card grid**

| Token                     | Value |
| ------------------------- | ----- |
| Tile gap                  | 16    |
| Section gap               | 24    |
| Section header → card     | 16    |
| Section card padding      | 16    |
| Form section padding      | 16    |
| Form body field gap       | 16    |
| Home spend row min height | 168   |
| Home income tile min      | 92    |
| Recent / mini-row min     | 64    |
| Budget row with progress  | 58    |
| Budget row spent-only     | 46    |

**Density:** same section gap everywhere. Do not mix cramped stats with airy cards on one view.

List rows **touch**; they separate with a `line` hairline, not gap.

---

## 4. Radius

**Five values. No one-offs.**

| Token  | px   | Use                                             |
| ------ | ---- | ----------------------------------------------- |
| `sm`   | 10   | Chips, tags, small icon tiles                   |
| `md`   | 16   | Inputs, slim cards, strips                      |
| `lg`   | 24   | Primary content cards, lists                    |
| `xl`   | 32   | Hero / large modal cards                        |
| `full` | 9999 | Pills, avatars, FAB, progress bars, day circles |

Do not copy deprecated leftovers (`xs: 6`, `hero: 22`).

Header is not a special curtain shape. It is a block: `surface` + `radius.lg` on the bottom corners + the same shadow as cards.

---

## 5. Elevation

Cards separate from `paper` by **soft shadow, never outline**. Shadow color is **neutral black**, not indigo.

### Native (reference)

**iOS**

| Token          | Offset | Opacity | Radius | Use                   |
| -------------- | ------ | ------- | ------ | --------------------- |
| `header`       | 0, 1   | 0.05    | 8      | App header, tab bar   |
| `card`         | 0, 2   | 0.06    | 10     | Standard card         |
| `cardElevated` | 0, 4   | 0.08    | 14     | Hero / primary card   |
| `sheet`        | 0, -2  | 0.06    | 12     | Bottom sheet (upward) |
| `toast`        | 0, 4   | 0.10    | 12     | Toasts                |
| `fab`          | 0, 4   | 0.18    | 12     | FAB                   |
| `tabIndicator` | 0, 4   | 0.10    | 8      | Selected-tab orb      |

**Android elevation:** card/header 2 · elevated 4 · sheet/toast 6 · fab 8 · tab orb 10.

Rows **inside** a card: no per-row shadow. One `line` hairline. The parent card carries elevation once.

### Web (use this)

```css
.card {
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
}
.card-elevated {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}
.header,
.top-nav {
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.05);
}
.sheet {
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
}
.toast {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.fab {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}
```

If a shadow looks weak, **increase blur**, do not add a gray border.

---

## 6. Iconography

- Library: **Lucide**, stroke **1.5** everywhere.
- Default color: `ink`. Chrome / header: `inkSoft`.
- Accent icons **only** for primary tappable actions.
- Category icons: mark-color stroke on an 8% tint circular tile.
- Destructive: `danger`.

| Token       | px  |
| ----------- | --- |
| `inline`    | 16  |
| `nav`       | 20  |
| `prominent` | 24  |
| `empty`     | 32  |
| `quickAdd`  | 13  |

Web: `lucide` / `lucide-react`, not `lucide-react-native`.

---

## 7. Motion and animation

**Feel:** calm, spring, confident. Not playful. **No bounce on tap.** Bounce only on success confirm. **No idle FAB pulse.** **No Material ripple.**

### 7.1 Springs (native reference)

| Name           | damping | stiffness | mass | Use                         |
| -------------- | ------- | --------- | ---- | --------------------------- |
| `snappy`       | 18      | 300       | 0.8  | Buttons, day select, chips  |
| `smooth`       | 20      | 200       | 1.0  | Cards, progress             |
| `gentle`       | 24      | 150       | 1.2  | Panels, large surfaces      |
| `bouncy`       | 12      | 280       | 0.9  | Success scale only          |
| `progress`     | 20      | 200       | 1.0  | Progress; overshoot clamped |
| `fabOpen`      | 16      | 220       | 0.75 | FAB rotate                  |
| `fabActions`   | 18      | 240       | 0.9  | Radial bubbles              |
| `tabIndicator` | 16      | 200       | 0.8  | Liquid tab pill             |
| `press`        | 18      | 260       | 0.7  | Press scale                 |

On web, approximate with CSS transitions (see [§13](#13-web-adaptations)).

### 7.2 Timings

| Name               | ms  | Easing                                          |
| ------------------ | --- | ----------------------------------------------- |
| `pressIn`          | 100 | ease-in-out                                     |
| `pressOut`         | 140 | ease-in-out                                     |
| `fast`             | 150 | ease-in-out                                     |
| `listEntrance`     | 120 | ease-in-out                                     |
| `tabTravelUp`      | 120 | ease-in-out                                     |
| `tabTravelDown`    | 180 | ease-in-out                                     |
| `panel`            | 180 | ease-in-out                                     |
| `normal`           | 250 | ease-in-out                                     |
| `screenTransition` | 280 | ease-in-out                                     |
| `agentExpand`      | 300 | cubic-bezier(0.33, 1, 0.68, 1) (ease-out cubic) |
| `agentCollapse`    | 220 | cubic-bezier(0.32, 0, 0.67, 0) (ease-in cubic)  |

Charts (viewport enter): bars/lines **720ms ease-out cubic**; donut **800ms ease-out cubic**.

### 7.3 Press (universal)

| Element            | Scale        | Extra                                   |
| ------------------ | ------------ | --------------------------------------- |
| Card / row         | **0.985**    | opacity 1 → 0.92                        |
| Chip / primary CTA | **0.97**     | chip also `transparent → surfaceSunken` |
| Ghost icon         | **no scale** | opacity 1 → 0.6 only                    |

Never scale below ~0.97 on browse taps.

### 7.4 Entrance

List rows: `translateY(10px) → 0`, opacity `0 → 1`, 120ms. Home stagger **16ms**, cap **64ms**. Cards: opacity + 8–10px Y. **No scale-bounce on load.**

### 7.5 Charts

Monochrome accent bars. Today stronger. Zero days = empty (no bar). Income = small success **dot**, not a second bar series.

---

## 8. Haptics

Native default tap: Android `Context_Click` (light). Respect a user toggle.

| Event                                   | Haptic                    |
| --------------------------------------- | ------------------------- |
| Routine tap                             | Light                     |
| Scale ≤ 0.97 press                      | Light                     |
| Long-press, drag reorder, budget breach | Medium / Heavy (reserved) |

**Web:** do not require haptics. `navigator.vibrate` is weak and often blocked. Optional tiny vibration on primary submit only.

---

## 9. Component patterns

### Header

White `surface`, **not** a gradient. Greeting Step 4, name Step 2. Icons ghost, `inkSoft`, **no filled circles**. Same card shadow as content.

### Hero money card

Eyebrow uppercase faint. Hero amount centered, tabular. Optional subtitle Step 4. Stats row under a hairline. Progress only if a budget exists (5–8px track, `radius.full`, fill accent or danger if over).

### Buttons

Min height **48px**. Press opacity 0.92.

| Variant      | Fill                            | Label  | Border     |
| ------------ | ------------------------------- | ------ | ---------- |
| Primary      | `accent` (disabled ≈ 60% alpha) | white  | none       |
| Danger       | `danger`                        | white  | none       |
| Secondary    | transparent                     | accent | 1px `line` |
| Ghost        | transparent                     | ink    | 1px `line` |
| Ghost danger | transparent                     | danger | 1px danger |

Native shared Button uses `border-radius: 12`. Spec wanted pills. **On web pick one and stick to it:** pills (`9999px`) for primary CTA, `16px` (`md`) for the rest. Do not mix 12 / 16 / full on the same page.

### Inputs

Min height 48. Border **2px** so focus/error do not change layout height. Unfocused `line`, focus `accent`, error `danger`. Label 12/500. Input 16/400.

### Pills / chips / dropdowns

Selected: `accentTint` fill + accent check. Surface `radius.md` + card shadow.

### Progress

Track `surfaceSunken`, fill `accent` (danger if over 100%). Height 5–8px, `radius.full`.

### Empty states

One component. Layouts: `inset` | `card` | `centered`. Headline ~h3 / ink, subtext bodySoft, optional pill CTA. Illustration (Lottie or static) 64–80px, gentle loop, **full color allowed** (only illustration exception). Omit the button if no single action unblocks the state.

### Lists

Parent card + hairline rows. Category tile 32px circle. Destructive swipe/reveal: `dangerTint`. No ripple.

### Mobile tab bar (do not port to desktop web)

Height 48 + safe area. Inactive `inkFaint`. Active = white floating orb + accent icon. Center FAB. Labels 10/500.

### Splash (native only)

Background `paper`. Min branded splash **1500ms**. Do not port to web.

---

## 10. Visual hierarchy

How to compose a view:

1. Pick **one** Step-1 number. Everything else demotes.
2. Eyebrow (Step 4) labels the hero; it never competes with it.
3. Section headers Step 3 (16/600). Body/rows Step 3. Meta Step 4.
4. Money uses tabular + accent/success/danger. Non-money stays ink.
5. Space with 16 / 24, not one-off gaps.
6. One elevation language: white cards on `#FAFAFA`.
7. If a section “needs pop,” increase **weight or size**, do not add color.

**Home example:** month spend = hero; daily cap + income/spent/net = Step 2–3; category/recent = Step 3 rows + Step 4 meta.

**Insights example:** month net or spend = hero; pace/charts = Step 3 structure; chart axes = Step 4.

---

## 11. Copy and chrome

- Eyebrows: short, uppercase, letterspaced (`THIS MONTH`, `WHO YOU PAID`).
- Empty headlines: one friendly line. Subtext: what unblocks the state, max two lines.
- Amounts: Indian grouping, `₹` + thin space (swap currency for another product, keep tabular + the same color rules).
- No purple “fintech template” gradients. No Inter. No decorative accent washes.
- Links: `accent`, not browser default purple. `:visited` stays accent.

---

## 12. Hard rules

1. One hero number per view.
2. Outer cards: shadow, **never** border.
3. Color only for money or alerts (plus 8% category tiles).
4. Radius from the 5-value scale only.
5. All amounts: tabular figures.
6. Section gap ≥ 24px.
7. Icons Lucide 1.5 / ink by default.
8. Press is soft (0.985 / 0.97). No ripple. No idle FAB breathe.
9. Bounce = success only.
10. Empty states share one component.

---

## 13. Web adaptations

Tokens, typeface, hierarchy, and the north-star rule **do not change**. These are the things that must change when this system leaves React Native.

### Units

RN `sp` / `dp` → CSS `px` at 1x, or `rem` from a 16px root (hero `42px` = `2.625rem`). Clamp the hero on small viewports so Step 1 does not blow a 320px layout:

```css
.hero-amount {
  font-size: clamp(2rem, 5vw, 2.625rem);
}
```

### Motion

No Reanimated. CSS `transition` / `@keyframes` / WAAPI.

| Native           | Web                                               |
| ---------------- | ------------------------------------------------- |
| spring `press`   | `transform: scale(0.985); transition: 100ms ease` |
| list stagger     | CSS `animation-delay`, or skip on long web lists  |
| 720ms chart rise | keep, gated by `prefers-reduced-motion`           |

Press-scale on **mouse hover** feels cheap. Use:

- **Hover:** slight shadow lift or `surfaceSunken` wash
- **Active / click:** 0.985 / 0.97
- **Keyboard:** focus ring, not scale

Always:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

### Focus (native barely has this)

Accent ring, 2px, offset 2px. Use `outline`, not a box-shadow that fights the card shadow. **`:focus-visible` only** — not `:focus` on mouse click. This is the web stand-in for “accent on selected.”

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

### Pointer vs touch

Keep 48px min hit on buttons and inputs. Rows may be slightly tighter on desktop. Hover states may exist; do not rely on them for meaning (touch has no hover).

### Type loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

Fallback: `system-ui` so FOIT does not blank the page. Put `font-variant-numeric: tabular-nums` on `.amount` (or globally if every number should align).

### Hairlines

1px solid `var(--line)` is enough. Do not chase `StyleSheet.hairlineWidth`.

### Do not port

- Bottom tab bar + center FAB
- 1500ms splash gate
- Edge-to-edge system nav bar
- Extra `padding-bottom: 48px` reserved for a tab bar
- Android `elevation` / iOS `shadowOpacity` APIs
- `includeFontPadding: false` (Android TextInput hack)

Web shell: top nav or sidebar, primary action in the header, no splash.

### Forms

Normal CSS inputs. Keep the **2px** border so focus does not jump layout. `min-height: 48px` still good for accessibility.

### Overlays

`overlays.scrim` + `position: fixed` + `inert` on the background. Escape closes. Scroll-lock `body`.

### Charts

Victory Native / Skia will not come along. Use Recharts, visx, Chart.js, or CSS. Keep the monochrome donut ladder and 720ms ease-out. Tooltips must work on **hover and click** (touch).

### Breakpoints (new; the app had none)

| Width      | Treatment                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| < 640px    | Stacked cards, 16px page pad                                                                                                      |
| 640–1024px | 20–24px pad                                                                                                                       |
| > 1024px   | Max content width **720–960px** for a money UI. Do not stretch a hero number across 1440px. Sidebar only if the product is dense. |

### Dark mode

This system is **light-only**. Do not auto dark-mode without a new palette.

```css
:root {
  color-scheme: light;
}
```

### Selection and scrollbars

```css
::selection {
  background: var(--accent-tint);
  color: var(--ink);
}
```

Optional thin scrollbar in `inkFaint`. Links stay `accent` when visited.

### Haptics

Skip as a design requirement on web.

### Common failure modes when pasting this into a web app

- Keeping FAB + tab bar on a desktop page
- Hover + 0.985 scale on every card (jitter)
- Adding gray borders because CSS shadows “look weak”
- Forgetting `:focus-visible`
- Loading Inter “just for UI”
- Hero 42px on a marketing landing **and** a dashboard widget — one Step-1 per **view**, not per site

---

## 14. CSS starter

```css
@import url("https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap");

:root {
  --paper: #fafafa;
  --surface: #ffffff;
  --surface-sunken: #f1f1f3;
  --line: #eaeaec;
  --ink: #14151a;
  --ink-soft: #5b5d68;
  --ink-faint: #a0a2ad;
  --accent: #2b3fe0;
  --accent-tint: rgba(43, 63, 224, 0.08);
  --accent-heat-1: rgba(43, 63, 224, 0.12);
  --accent-heat-2: rgba(43, 63, 224, 0.28);
  --accent-heat-3: rgba(43, 63, 224, 0.6);
  --success: #1a8754;
  --success-tint: rgba(26, 135, 84, 0.08);
  --danger: #d6394a;
  --danger-tint: rgba(214, 57, 74, 0.08);
  --warning: #b5790a;
  --warning-tint: rgba(181, 121, 10, 0.08);
  --scrim: rgba(0, 0, 0, 0.35);
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-xl: 32px;
  --radius-full: 9999px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --shadow-card: 0 2px 10px rgba(0, 0, 0, 0.06);
  --shadow-elevated: 0 4px 14px rgba(0, 0, 0, 0.08);
  --font: "Hanken Grotesk", system-ui, sans-serif;
  color-scheme: light;
}

html {
  background: var(--paper);
  color: var(--ink);
}

body {
  margin: 0;
  font-family: var(--font);
  font-size: 15px;
  line-height: 22px;
  font-weight: 400;
}

.amount {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--accent);
}

.eyebrow {
  font-size: 11px;
  line-height: 14px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

::selection {
  background: var(--accent-tint);
  color: var(--ink);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

Native RN import surface (this repo): `@/constants` — `color`, `typography`, `spacing`, `radius`, `shadows`, `springs`, `timings`, `listEntrance`, `iconSizes`, `bento`.
