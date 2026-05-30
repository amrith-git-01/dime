# Design System — Dime

> **Product:** Personal expense tracker (Android, light mode first)  
> **Personality:** Soft. Spacious. Confident.  
> **Fonts:** Inter (UI) · JetBrains Mono (money)  
> **Icons:** Lucide (`lucide-react-native`, stroke `1.5` at 20dp+)  
> **Motion:** Reanimated 3 — springs for interaction, timed loops only for skeleton/FAB breathe  
> **Code:** `frontend/src/constants/theme.ts` · `motion.ts` · `fonts.ts`

---

## Table of contents

1. [Design architecture](#1-design-architecture)
2. [Colors](#2-colors)
3. [Typography](#3-typography)
4. [Motion, animation & effects](#4-motion-animation--effects)

---

## 1. Design architecture

### 1.1 What we are building

Dime is a **premium consumer** finance app — approachable, calm, and readable. It is not corporate banking UI. Data is always visible; empty and loading states are designed, not afterthoughts.

### 1.2 Core principles

| #   | Principle                | Rule                                                                             |
| --- | ------------------------ | -------------------------------------------------------------------------------- |
| 1   | One hero per screen      | One dominant answer per screen (Home → today spend; Transactions → list).        |
| 2   | Soft & spacious          | 16–24dp gaps; cards do not touch; page background is tinted, not grey.           |
| 3   | Rounded surfaces         | `radius.lg`+ for cards; `radius.full` for pills and FAB.                         |
| 4   | Layered depth            | White cards float on tinted page; colored bento tiles add energy on Home.        |
| 5   | Violet is scarce         | Brand violet for header, gradient hero, FAB, CTAs, focus — not every background. |
| 6   | Category color is stable | Same hex per category everywhere (list, budget, bento, charts).                  |
| 7   | Type creates hierarchy   | Size/weight first; color reinforces. Money always in mono.                       |
| 8   | Motion has purpose       | Springs for taps and layout; no decorative JS-thread loops on lists.             |

### 1.3 Visual layers

Bottom to top:

```
┌─────────────────────────────────────────┐
│  Page (#f9f9ff)                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ Bento tile  │  │ Gradient hero    │  │  ← saturated / gradient, WHITE text
│  │ (category)  │  │ (spent today)    │  │
│  └─────────────┘  └──────────────────┘  │
│  ┌─────────────────────────────────────┐│
│  │ White card — lists, forms, recent tx ││  ← dark text tokens
│  └─────────────────────────────────────┘│
│  Header gradient + Tab bar (unchanged)   │
└─────────────────────────────────────────┘
```

### 1.4 Surface types

| Surface            | Background                                    | Text                            | Use                                |
| ------------------ | --------------------------------------------- | ------------------------------- | ---------------------------------- |
| **Page**           | `colors.pageBackground`                       | —                               | Screen base under `TabScreenShell` |
| **White card**     | `#FFFFFF` + `colors.cardBorder`               | `textPrimary` / `textSecondary` | Lists, forms, recent transactions  |
| **Gradient hero**  | `#6355E8` → `#8B7FF5`                         | `textOnPrimary` / `hero.*`      | Home “Spent today”, app header     |
| **Bento tile**     | `bento.surface.*` or category **primary** hex | `bento.onSurface.*`             | Home month metric, category grid   |
| **List icon chip** | Category **muted** (~14% alpha)               | Category primary on icon        | Transaction rows only              |

**White card spec** (`layout.card`):

- Padding `24dp`, radius `20dp`, border `1px #E0DFFA`
- Shadow: `0 2px 12px rgba(99, 85, 232, 0.06)`

**Gradient hero spec** (`layout.heroCard` + gradient):

- Radius `22–24dp`, padding `24dp`, colored shadow `rgba(99, 85, 232, 0.35)`
- Decorative orbs: `hero.orbLarge` / `hero.orbSmall`
- All labels, amounts, progress on hero: **white**

### 1.5 Home bento grid

Modular Home body (below header, above tab bar):

```
┌──────────────┬────────────────────────────────┐
│ Today (~35%) │ Month (~65%) + budget ring     │
└──────────────┴────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ Income vs expense — credited / debited / net │
└──────────────────────────────────────────────┘
│ Category bento — 2 columns, saturated        │
├──────────────────────────────────────────────┤
│ Recent — stacked mini-bento rows             │
└──────────────────────────────────────────────┘
```

| Zone              | Surface                               | Text & charts                                      |
| ----------------- | ------------------------------------- | -------------------------------------------------- |
| Spent today       | Spending gradient (narrow ~35%)       | White; no daily ring                               |
| Spent month       | `bento.monthSpendSurface` (wide ~65%) | White + **monthly budget ring**                    |
| Income vs expense | `bento.incomeExpenseSurface`          | White; credited / debited / net                    |
| Category cell     | Category primary hex                  | White label, white mono amount                     |
| Progress in tile  | —                                     | Track `bento.chart.track`, fill `bento.chart.fill` |
| Recent mini-bento | Category-tinted pastel row            | Standard list typography on light tint             |
| Empty bento       | `bento.surface.lavender`              | White copy only (capture via tab FAB)              |

**Bento rules**

1. Colored tile → **only** `bento.onSurface.*` and white chart ink.
2. **One** full gradient hero on Home (today). No second full-width violet card.
3. Category tiles use **full saturation** hex, not muted 10% fills.
4. Muted fills stay on **list icon containers** only.
5. Tinted shadow on colored tiles (~8–12% of tile hue); white cards keep violet-tint shadow.

### 1.5.1 Transactions bento

Browse-by-day tab — same pastel vocabulary as Home, **no** cash-flow / net stats (those live on Home).

```
┌──────────────────────────────────────────────┐
│ Month card — dropdown + count · spent        │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ Day bar — prev/next, date, transaction count │
└──────────────────────────────────────────────┘
┌─ section card ───────────────────────────────┐
│ BentoTransactionTile rows (green/red amounts)│
└──────────────────────────────────────────────┘
```

| Zone        | Surface                                             | Notes                                      |
| ----------- | --------------------------------------------------- | ------------------------------------------ |
| Month card  | `bento.twoToneHeaderSurface` + `twoToneBodySurface` | Two-tone violet header + white stats body  |
| Day bar     | White card                                          | Compact; not full-width purple pill        |
| Day list    | `bento.sectionSurface`                              | Reuses Home `BentoTransactionTile`         |
| Empty month | Section card + copy                                 | `BentoQuickAddPills` when month has no txs |

Month picker: **12** rolling calendar months. FlashList pagination unchanged.

### 1.5.2 Budget bento

Budget tab — browse-only; create/update monthly cap on stack screen `EditMonthlyBudget`.

```
┌──────────────────────────────────────────────┐
│ Summary card — violet header + white stats   │
│ THIS MONTH · status    [edit] [MMM yyyy ▼]    │
│ Budget · Spent · Remaining + progress bar     │
└──────────────────────────────────────────────┘
┌ All categories                      + Add ───┐
│ BudgetCategoryBentoRow × N (FlashList)      │
└─────────────────────────────────────────────┘
```

| Zone           | Surface                      | Notes                                                      |
| -------------- | ---------------------------- | ---------------------------------------------------------- |
| Summary header | `bento.twoToneHeaderSurface` | Status, month dropdown (`colors.primaryMuted` violet tint) |
| Summary body   | `bento.twoToneBodySurface`   | Budget · Spent · Remaining; white stats strip              |
| No budget      | Same card shape              | Placeholder stats + **Set budget** CTA → stack             |
| Category row   | Page background              | Muted icon chip, share-of-budget progress bar              |
| Edit budget    | Stack screen                 | Amount input, daily limit preview, Save                    |

**Rules:** No gradient hero on Budget tab. Month picker: **12** rolling months (inline dropdown). Violet scarce — edit is icon chip on pastel header, not full-width hero.

### 1.6 Layout tokens

**Spacing** (4dp base) — `spacing.*`

| Token | dp  | Typical use                             |
| ----- | --- | --------------------------------------- |
| `xs`  | 4   | Tight gaps                              |
| `sm`  | 8   | Icon gaps, chip padding                 |
| `md`  | 12  | Row internal                            |
| `lg`  | 16  | Screen horizontal padding, section gaps |
| `xl`  | 24  | Card padding, section breaks            |

**Screen content:** `layout.screenContent` — horizontal `16`, top `16`, bottom `48`.

**Radius** — `radius.*`

| Token  | dp   | Use                 |
| ------ | ---- | ------------------- |
| `xs`   | 6    | Badges              |
| `sm`   | 10   | Inputs              |
| `md`   | 14   | List rows           |
| `lg`   | 20   | Main cards          |
| `xl`   | 24   | Bento tiles, sheets |
| `x2l`  | 32   | Large overlays      |
| `full` | pill | FAB, chips          |

### 1.7 Iconography

- **Set:** Lucide only — no emoji as UI icons.
- **Sizes:** 16 inline · 20 nav/actions · 24 prominent · 32 empty states.
- **Category in lists:** Icon inside rounded square with `categoryMutedBackground(color)`.

### 1.8 Anti-patterns

- Dark text on saturated bento or category tiles
- Category-colored chart fill on same-hue tile background
- Grey `#F5F5F5` page backgrounds (use violet tint)
- Bare emojis in lists
- `Animated` API on scroll lists (use Reanimated)
- Spinners instead of shape-matched skeletons
- Inter for currency amounts in lists
- More than one gradient hero per screen

---

## 2. Colors

Token names match `theme.ts` unless noted. Prefer importing tokens over hard-coded hex in components.

### 2.1 Brand & primary

| Token                        | Hex       | Usage                        |
| ---------------------------- | --------- | ---------------------------- |
| `colors.brandPrimary`        | `#6355E8` | Brand, FAB, links, focus     |
| `colors.primary`             | `#4F46E5` | Legacy accent / some links   |
| `colors.primaryMuted`        | `#EEEDFB` | Subtle fills, tags           |
| `colors.headerGradientStart` | `#6355E8` | Header & hero gradient start |
| `colors.headerGradientEnd`   | `#8B7FF5` | Header & hero gradient end   |

**Gradients**

```
spendingCard      = linear-gradient(135deg, #6355E8 0%, #8B7FF5 100%)
spendingCardWarm  = linear-gradient(135deg, #6355E8 0%, #9B6EF8 100%)  // optional
```

### 2.2 Backgrounds & surfaces

| Token                    | Hex                    | Usage           |
| ------------------------ | ---------------------- | --------------- |
| `colors.pageBackground`  | `#f9f9ff`              | App screen base |
| `colors.barBackground`   | `#FFFFFF`              | Cards, inputs   |
| `colors.surfaceTint`     | `#FAFAFF`              | Subtle panels   |
| `surfaces.primaryTint08` | `rgba(99,85,232,0.08)` | Highlights      |
| `surfaces.primaryTint10` | `rgba(99,85,232,0.10)` | Stronger tint   |

### 2.3 Text

| Token                       | Hex                      | Usage                   |
| --------------------------- | ------------------------ | ----------------------- |
| `colors.textPrimary`        | `#151c27`                | Headings, body on white |
| `colors.textSecondary`      | `#464555`                | Captions on white       |
| `colors.textListPrimary`    | `#0A0A1F`                | List titles, amounts    |
| `colors.textListSecondary`  | `#6B6B80`                | List meta               |
| `colors.textOnPrimary`      | `#FFFFFF`                | On gradient / brand     |
| `colors.textOnPrimaryMuted` | `rgba(255,255,255,0.88)` | Secondary on gradient   |
| `colors.inactive`           | `#6B7280`                | Disabled, hints         |

### 2.4 Borders

| Token                           | Hex       |
| ------------------------------- | --------- |
| `colors.cardBorder`             | `#E0DFFA` |
| `colors.border` / `borderLight` | `#E5E7EB` |
| `colors.borderList`             | `#EEEEFF` |

### 2.5 Semantic

| Token                     | Hex                   | Meaning                       |
| ------------------------- | --------------------- | ----------------------------- |
| `colors.success`          | `#16A34A`             | Credit, positive              |
| `colors.danger` / `error` | `#DC2626` / `#BA1A1A` | Delete, errors                |
| `progressBar.fillDefault` | `#FF6B6B`             | Budget burn (light surfaces)  |
| `progressBar.track`       | `#F2F0FF`             | Budget track (light surfaces) |

Do not use success/danger for non-semantic decoration.

### 2.6 Category palette

| Category      | Primary                       | Muted (lists)                            |
| ------------- | ----------------------------- | ---------------------------------------- |
| Food & dining | `#FF6B6B`                     | ~14% alpha via `categoryMutedBackground` |
| Transport     | `#4ECDC4`                     | 同上                                     |
| Shopping      | `#A855F7`                     | 同上                                     |
| Health        | `#4ADE80`                     | 同上                                     |
| Entertainment | `#FB923C`                     | 同上                                     |
| Utilities     | `#FBBF24`                     | 同上                                     |
| Travel        | `#818CF8`                     | 同上                                     |
| Education     | `#F472B6`                     | 同上                                     |
| Income        | `#34D399`                     | 同上                                     |
| Uncategorized | `#94A3B8` (`categoryDefault`) | `categoryDefaultMuted`                   |

**Home bento category cells:** primary hex as **tile background**, white foreground.

### 2.7 Bento surfaces (`bento.*`)

| Token                        | Hex       | Notes                                       |
| ---------------------------- | --------- | ------------------------------------------- |
| `bento.twoToneHeaderSurface` | `#EEEDFB` | Two-tone card header (Transactions, Budget) |
| `bento.twoToneBodySurface`   | `#FFFFFF` | Two-tone card stats body                    |
| `bento.monthSpendSurface`    | `#E0F2FE` | Home month tile only                        |
| `bento.incomeExpenseSurface` | `#D1FAE5` | Home cash-flow tile only                    |
| `bento.sectionSurface`       | `#F5F3FF` | Section wrappers, day list                  |
| `bento.surface.lavender`     | `#8B7FF5` | Empty states                                |
| `bento.surface.mint`         | `#4ADE80` |                                             |
| `bento.surface.sky`          | `#38BDF8` | Default month tile (`monthSpendSurface`)    |
| `bento.surface.coral`        | `#FF6B6B` |                                             |
| `bento.surface.peach`        | `#FB923C` |                                             |
| `bento.surface.teal`         | `#4ECDC4` |                                             |
| `bento.surface.indigo`       | `#818CF8` |                                             |
| `bento.surface.rose`         | `#F472B6` |                                             |

**On bento / hero (white UI)**

| Token                       | Value                    |
| --------------------------- | ------------------------ |
| `bento.onSurface.primary`   | `#FFFFFF`                |
| `bento.onSurface.secondary` | `rgba(255,255,255,0.85)` |
| `bento.onSurface.muted`     | `rgba(255,255,255,0.65)` |
| `bento.chart.track`         | `rgba(255,255,255,0.28)` |
| `bento.chart.fill`          | `#FFFFFF`                |
| `bento.icon.bg`             | `rgba(255,255,255,0.18)` |
| `bento.icon.fg`             | `#FFFFFF`                |

### 2.8 Hero overlays (`hero.*`)

Used on gradient header and spending hero: `progressTrack`, `orbLarge`, `orbSmall`, `statBg`, `chipBg`, skeleton whites — see `theme.ts`.

### 2.9 Overlays & skeleton

| Group                | Purpose                   |
| -------------------- | ------------------------- |
| `overlays.scrim`     | Modals `rgba(0,0,0,0.35)` |
| `overlays.backdrop`  | Light sheets              |
| `skeleton.surface`   | Shimmer on white cards    |
| `skeleton.onPrimary` | Shimmer on gradient/bento |

---

## 3. Typography

### 3.1 Families

| Role  | Family         | Export                              |
| ----- | -------------- | ----------------------------------- |
| UI    | Inter          | `fontFamilies.regular` … `semiBold` |
| Money | JetBrains Mono | `fontFamilies.mono`, `monoSemiBold` |

Load via `@expo-google-fonts/inter` and `@expo-google-fonts/jetbrains-mono`.

### 3.2 Scale (reference)

| Role          | Family | Size / line | Weight   | Token                                  |
| ------------- | ------ | ----------- | -------- | -------------------------------------- |
| Hero amount   | Mono   | 40 / 48     | SemiBold | `typography.bentoAmountHero`           |
| Bento amount  | Mono   | 26 / 32     | SemiBold | `typography.bentoAmount`               |
| Screen title  | Inter  | 24 / 32     | SemiBold | `typography.screenTitle`               |
| Section title | Inter  | 14 / 18     | Medium   | `typography.sectionTitle`              |
| Card title    | Inter  | 18 / 24     | SemiBold | `typography.cardTitle`                 |
| Body          | Inter  | 14 / 20     | Regular  | `typography.cardBody`                  |
| List merchant | Inter  | 16 / 20     | SemiBold | `typography.transactionList.merchant`  |
| List amount   | Mono   | 16 / 20     | SemiBold | `typography.transactionList.amount`    |
| Caption       | Inter  | 11–12       | Regular  | `transactionList.time`, `bentoSubtext` |
| Tab label     | Inter  | 11 / 14     | Medium   | `typography.tabLabel`                  |

### 3.3 Rules

1. **All currency and numeric totals** → JetBrains Mono (lists, heroes, bento, budget).
2. **List amounts** → right-aligned; debit default color, credit `colors.success` with `+`.
3. **On colored bento or gradient** → use `typography.bento*` / white only — never `textPrimary`.
4. **Hierarchy** → prefer larger size or heavier weight before adding color.
5. **Letterspacing** → slight negative tracking on large display amounts (`-0.5` to `-1.5`).

---

## 4. Motion, animation & effects

**Stack:** `react-native-reanimated` only for UI-thread motion. Import presets from `constants/motion.ts`.

**Philosophy:** Springs for user-driven changes; fixed-duration only for skeleton pulse, FAB breathe, and panel slides. Respect `AccessibilityInfo.isReduceMotionEnabled()` — skip breathe and stagger when reduced.

### 4.1 Spring presets (`springs.*`)

| Preset         | damping | stiffness | mass | Use                                       |
| -------------- | ------- | --------- | ---- | ----------------------------------------- |
| `snappy`       | 18      | 300       | 0.8  | Press, toggles, FAB press                 |
| `smooth`       | 20      | 200       | 1.0  | Cards, panels, modals                     |
| `gentle`       | 24      | 150       | 1.2  | Large layout shifts                       |
| `bouncy`       | 12      | 280       | 0.9  | Celebratory feedback                      |
| `progress`     | 20      | 200       | 1.0  | Progress bars (`overshootClamping: true`) |
| `fabOpen`      | 16      | 220       | 0.75 | FAB menu open                             |
| `fabActions`   | 18      | 240       | 0.9  | Radial action bubbles                     |
| `tabIndicator` | 16      | 200       | 0.8  | Active tab pill                           |

### 4.2 Timing presets (`timings.*`)

| Preset         | ms  | Use                            |
| -------------- | --- | ------------------------------ |
| `pressIn`      | 120 | Press feedback                 |
| `pressOut`     | 160 | Release                        |
| `fast`         | 150 | Micro fades                    |
| `normal`       | 250 | General                        |
| `panel`        | 180 | Sheets (`motion.panelSlideMs`) |
| `listEntrance` | 120 | Row fade/slide                 |

### 4.3 Interaction patterns

| Element             | Behavior                                     | Token                                       |
| ------------------- | -------------------------------------------- | ------------------------------------------- |
| Button / card press | Scale ~0.96–0.98, opacity dip                | `springs.snappy`, `listEntrance.pressScale` |
| Progress bar fill   | `withSpring` to target                       | `springs.progress`                          |
| List row entrance   | opacity 0→1, translateY 10→0, stagger capped | `listEntrance.*`                            |
| FAB idle            | scale 1.0 ↔ 1.04 loop                        | `fabBreathe` (2800ms full cycle)            |
| FAB menu idle close | 2000ms no interaction                        | `fabIdleCloseMs`                            |
| Skeleton            | opacity pulse 0.55 ↔ 1                       | `skeletonPulse` (700ms half-cycle)          |
| Tab switch          | Indicator spring                             | `springs.tabIndicator`                      |

**Haptics (optional):** light impact on primary press; medium on FAB — never required for accessibility.

### 4.4 Visual effects

**Shadows**

| Level      | Use                 | Approximate                          |
| ---------- | ------------------- | ------------------------------------ |
| Card       | White surfaces      | `0 2px 12px rgba(99,85,232,0.06)`    |
| Elevated   | Selected / floating | `0 4px 16px rgba(99,85,232,0.10)`    |
| FAB / hero | Primary actions     | `0 8px 24–32px rgba(99,85,232,0.35)` |
| Bento tile | Colored cells       | Tinted with tile hue at ~10% opacity |

**Gradients:** Header and today hero — see §2.1. Optional soft mesh blobs via low-opacity white orbs (`hero.orb*`).

**Glass / blur:** Not used on Android target; use opaque white or saturated bento instead.

**Skeleton:** Match final layout geometry; on bento use white-alpha shimmer on tile color, on white cards use `skeleton.surface`.

### 4.5 What we do not document here

Per-screen gesture specs (swipe-to-delete, pinch charts, etc.) live in feature implementation and code review — not in this file. Follow the spring/timing tokens above when adding new motion.

---

_Last updated: May 2026 — consolidated reference (architecture, colors, typography, motion)._
