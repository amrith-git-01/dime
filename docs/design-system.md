# 🎨 Design System — Dime (Expense Tracker App)

> **Theme:** Monochrome Neutral + Single Indigo Accent — Light Mode  
> **Platform:** Android Only  
> **Font:** One geometric grotesk, everywhere (tabular figures for numbers)  
> **Direction:** Calm, confident, modern. Restraint is the aesthetic — the accent color is earned, not decorative.  
> **Last Updated:** June 2026 — full rebuild, replaces violet/Inter system

---

## Why this exists

The previous system (`color.primary = #6355E8`, Inter everywhere, soft lavender surfaces) was the single most common "AI-generated fintech" pattern: purple gradient header on white cards. It wasn't broken, it just wasn't *designed* — every screen reached for a different elevation/radius/density rule because nothing forced consistency.

This system has exactly one rule that matters more than any token below:

> **If you're not showing money or an alert, you don't get color.** Everything else is ink, gray, and white. The indigo accent appears only on amounts, primary actions, and warning/danger states. That scarcity is what makes it feel premium instead of decorated.

---

## 📋 Table of Contents

1. [Color System](#color-system)
2. [Typography](#typography)
3. [Spacing & Layout](#spacing--layout)
4. [Elevation](#elevation)
5. [Border Radius](#border-radius)
6. [Iconography](#iconography)
7. [Component Patterns](#component-patterns)
8. [Animation Principles](#animation-principles)
9. [Consistency Rules — Read Before Building Any Screen](#consistency-rules)

---

## Color System

### The Palette (deliberately small)

| Token | Value | Usage |
|---|---|---|
| `color.ink` | `#14151A` | All primary text, headings, default icon color |
| `color.inkSoft` | `#5B5D68` | Secondary text, captions, timestamps, inactive labels |
| `color.inkFaint` | `#A0A2AD` | Placeholder text, disabled states, dividers-on-dark |
| `color.paper` | `#FAFAFA` | App background — true near-white, **no tint** |
| `color.surface` | `#FFFFFF` | Cards, sheets, inputs — pure white, sits on `paper` via shadow only |
| `color.surfaceSunken` | `#F1F1F3` | Track backgrounds (progress bars), skeleton base, pressed states |
| `color.line` | `#EAEAEC` | The *only* border color in the system — hairline dividers, never card outlines |

**Note on `color.line`:** since surfaces are defined by soft shadow (not borders), `color.line` is reserved for internal dividers within a card (e.g. separating list rows), never for the outer edge of a card.

### The One Accent

| Token | Value | Usage — and ONLY this usage |
|---|---|---|
| `color.accent` | `#2B3FE0` | Monetary amounts (debits/neutral), primary CTA buttons, active/selected state, focus rings |
| `color.accentSoft` | `#E8EAFB` | Background tint behind accent icons/badges — the *only* tinted surface allowed |
| `color.accentDeep` | `#1C2BB0` | Pressed state of accent buttons |

**Hard rule:** `color.accent` never appears as a decorative header gradient, never as a tab-bar background, never as a card background. It appears on: numbers that are money, the FAB, primary buttons, selected pills, and focus/active indicators. If you find yourself reaching for accent to "make a section pop," don't — use type weight or spacing instead.

### Semantic Colors (functional only, same restraint applies)

| Token | Value | Usage |
|---|---|---|
| `color.success` | `#1A8754` | Income, credits, positive net — text only, never a filled background |
| `color.successSoft` | `#E8F5EE` | Small badge background only (e.g. "+₹500" chip) |
| `color.danger` | `#D6394A` | Budget exceeded, delete, destructive actions, debit emphasis when over budget |
| `color.dangerSoft` | `#FBE9EB` | Danger badge/banner background only |
| `color.warning` | `#B5790A` | 80% budget threshold text only |
| `color.warningSoft` | `#FBF1E1` | Warning badge background only |

Semantic colors follow the same scarcity rule as the accent: text and small badges, never large fills, never headers.

### Category Marks (the one place multiple colors are allowed)

Categories still need to be visually distinct in charts and icon tiles. But they no longer get full-saturation fills — they get a **single consistent treatment**: a 6%-opacity tint tile with a full-strength icon stroke. No category color ever appears as a large surface.

| Category | Mark Color |
|---|---|
| 🍔 Food & Dining | `#E0594A` |
| 🚗 Transport | `#2E9E96` |
| 🛍️ Shopping | `#8E5FD9` |
| 💊 Health | `#3FA66B` |
| 🎬 Entertainment | `#D97B3D` |
| 💡 Utilities | `#C9A227` |
| ✈️ Travel | `#5470D4` |
| 📚 Education | `#C25B92` |
| 💰 Income | `#1A8754` (reuses success — income is semantic, not categorical) |
| 📦 Others | `#7B7D87` |

Icon tile formula (fixed, never deviates): `background: color-mix(markColor 8%, white)`, icon stroke: `markColor` at full opacity, `1.5px` stroke. This is the **only** multi-color surface allowed anywhere in the app, and it's capped at 8% tint specifically so it reads as a label, not decoration.

---

## Typography

### One Typeface, Doing Everything

```
font.display = "Schibsted Grotesk"   // or "General Sans" / "Söhne" if licensing allows
```

Why a distinctive geometric grotesk instead of Inter: Inter is the single most-flagged "default AI choice" — it disappears into every other app. A geometric grotesk with real character (slightly squared bowls, confident weight contrast) gives the brand a typographic identity Inter cannot, while remaining completely legible at small UI sizes.

**Critical technical requirement:** this typeface must be loaded with **tabular figures enabled** (`font-feature-settings: "tnum"` / OpenType `tnum`) specifically for any numeric context — amounts, dates, percentages. Without tabular figures, "₹1,240" and "₹128" won't align in a list, and the whole "looks engineered" effect breaks. This replaces the old mono-font-for-money rule with a feature-flag rule on the same face — same alignment benefit, one less font to load.

```
@font-face numeric contexts → font-feature-settings: "tnum" 1, "ss01" 1;
```

### Type Scale

| Token | Size / Weight / Tracking | Usage |
|---|---|---|
| `font.hero` | 44sp / 700 / -1.5px / tabular | The single largest number on a screen — home spending figure only. One per screen, no exceptions. |
| `font.h1` | 26sp / 700 / -0.5px | Screen titles |
| `font.h2` | 19sp / 600 / -0.3px | Section headers ("Top categories", "Cash flow") |
| `font.h3` | 16sp / 600 / -0.1px | Card titles, sheet titles |
| `font.body` | 15sp / 450 / 0px | Merchant names, primary readable content |
| `font.bodySoft` | 14sp / 450 / 0px, color `inkSoft` | Secondary descriptive text |
| `font.label` | 12sp / 600 / 0.3px, uppercase | Eyebrow labels ("THIS MONTH", "BUDGET") |
| `font.caption` | 11.5sp / 450 / 0.1px, color `inkSoft` | Timestamps, metadata |
| `font.amountLarge` | 28sp / 650 / -0.5px / tabular | Card-level amounts (budget summary, stat tiles) |
| `font.amountRow` | 16sp / 600 / -0.2px / tabular | List-row amounts (transaction list) |
| `font.amountSmall` | 13sp / 600 / -0.1px / tabular | Inline/secondary amounts (category rows) |

### Hierarchy Rules

**Rule 1 — One hero per screen, always.** Exactly one number at `font.hero` size. Currently the home screen has *no* clear single hero (it's a row of mid-size stats) — under this system, the single most important figure (e.g. amount remaining, or amount spent) takes the hero slot, full width, and everything else demotes to `amountLarge` or smaller.

**Rule 2 — Weight and size create hierarchy. Color does not.** This is the opposite of the old system, where purple meant "important." Now: bigger/bolder = more important. Color (accent) only ever marks "this is a monetary value" or "this is actionable" — never "this is the important one on this screen."

**Rule 3 — Every amount uses tabular figures, no exceptions,** including in cards, lists, charts, and dialogs.

### Explicit Weight Ladder (what "hierarchy" means in practice)

The old app had no consistent relationship between sizes — h1/h2/h3/body were all roughly similar Inter weights, so nothing actually competed for attention except color. This system fixes that by defining a strict **4-step visual weight ladder**. Every screen's content maps to exactly one of these four steps — never in-between, never skipped:

| Step | Role | Token(s) | Example |
|---|---|---|---|
| **1 — Hero** | The one thing the screen exists to show | `font.hero` (44sp/700) | "₹24,996 remaining" on Home |
| **2 — Primary** | Section-defining numbers and titles | `font.h1`, `font.amountLarge` | Screen title, stat-tile amounts |
| **3 — Secondary** | Supporting structure | `font.h2`, `font.h3`, `font.amountRow`, `font.body` | Section headers, row amounts, merchant names |
| **4 — Tertiary** | Context, metadata, chrome | `font.label`, `font.caption`, `font.bodySoft`, `font.amountSmall` | Timestamps, eyebrow labels, helper text |

**The ladder rule:** a screen reads as having clear hierarchy only if you can point at exactly one Step-1 element, a handful of Step-2 elements, more Step-3, and the most Step-4. If a screen has two Step-1-sized things, or skips straight from Step-1 to Step-4 with nothing in between, the hierarchy is broken — this was the home screen's exact problem (big colored stat blocks at near-hero size sitting directly next to small gray label pairs, with nothing bridging the two).

**Weight, not just size, carries hierarchy too.** Step 1 and 2 use 650–700 weight. Step 3 sits at 450–600. Step 4 never exceeds 600, and is usually 450. Two elements at the same size but different weight still read as different steps — useful for keeping a screen from feeling like it has too many "big" things even when sizes are similar (e.g. `font.h2` at 600 weight vs `font.body` at 450 weight, both ~15-19sp, but distinctly different roles).

---

## Spacing & Layout

Same 4dp base unit as before — this was never the problem.

```
space.1  =  4dp
space.2  =  8dp
space.3  = 12dp
space.4  = 16dp   ← standard padding
space.5  = 20dp
space.6  = 24dp   ← section spacing
space.8  = 32dp
space.10 = 40dp
```

```
layout.screenPaddingH = 20dp   // slightly wider than before — generous margins read as "considered"
layout.cardPadding    = 20dp
layout.sectionGap     = 32dp   // increased — the old system cramped sections together
layout.listItemGap     = 1dp   // rows touch and separate via color.line, not gap — see Elevation
```

**Density rule:** pick generous spacing and stick to it everywhere. The old screens alternated between cramped stat rows and airy cards — under this system every section gets the same `sectionGap`, no screen-specific exceptions.

---

## Elevation

**The single decision that fixes the biggest inconsistency in the old app: every surface uses the same soft-shadow system. No borders on cards, ever. No flat list rows sitting directly on `paper` background.**

```javascript
shadow.card = {
  offsetX: 0,
  offsetY: 1,
  blur: 3,
  spread: 0,
  color: 'rgba(20, 21, 26, 0.04)',     // primary contact shadow — very soft
}
// plus a second, longer shadow for depth (use both, stacked):
shadow.cardAmbient = {
  offsetX: 0,
  offsetY: 8,
  blur: 24,
  spread: -4,
  color: 'rgba(20, 21, 26, 0.06)',
}

shadow.raised = {
  // for the FAB and any pressed/focused floating element
  offsetX: 0,
  offsetY: 10,
  blur: 28,
  spread: -6,
  color: 'rgba(43, 63, 224, 0.28)',    // tinted with accent — the FAB is allowed this, nothing else
}
```

**Every card — stat tile, transaction row, settings row, budget card — uses `shadow.card` + `shadow.cardAmbient` stacked, on `color.surface`, with zero border.** This single rule eliminates the inconsistency where some rows had shadows, some had borders, and some had neither.

List rows inside a card (e.g. transaction rows in one card) don't get individual shadows — they're separated by a single `color.line` hairline, and the *card itself* carries the shadow once.

---

## Border Radius

**Fully rounded, pill-leaning, but with one fixed scale — not "whatever felt right per-component" like before.**

```
radius.sm   = 16dp   // inputs, small buttons, badges
radius.md   = 20dp   // standard cards, list-row containers
radius.lg   = 28dp   // hero cards (the one big stat card per screen)
radius.full = 9999dp // pills, FAB, avatar circles, category icon tiles, chips
```

**Rule:** there are exactly four radius values in the entire app. The old system's biggest visual inconsistency was the header's huge asymmetric curtain-curve sitting above sharply-cornered cards — under this system, **the header is not a special shape**. It's a regular block using `radius.lg` at the bottom corners only, sized and spaced exactly like any hero card, so it reads as "the first card in the stack," not "a banner."

---

## Iconography

**Library:** `lucide-react-native`, stroke width `1.5` throughout — unchanged, this wasn't the problem.

**New rule:** icons are always `color.ink` by default. They only take `color.accent` when they represent a tappable primary action (FAB plus icon, send button). Category icons sit inside the 8%-tint tile defined above and use their category mark color — this is the only exception to "icons are ink."

```
icon.sm  = 16dp
icon.md  = 20dp
icon.lg  = 24dp
icon.xl  = 32dp   // category tile icons
```

---

## Component Patterns

### The Header (no longer a banner)

The header is restructured to be a **hero card**, not a decorative curtain:

- Background: `color.surface` (white), not a gradient
- Bottom corners only: `radius.lg`
- Contains: greeting (`font.bodySoft`), name (`font.h1`), settings/notification icons (ink, ghost buttons — no filled circle backgrounds)
- Carries `shadow.card` + `shadow.cardAmbient` just like every other card
- **No gradient, ever.** This single change removes the most "AI template" signal in the whole app.

### Stat Tiles (home screen)

Old: two colored blocks (`Spent Today` dark purple, `Spent This Month` light blue) — inconsistent with everything else and the *only* place those colors appeared.

New: both tiles are `color.surface` with `shadow.card`. The numbers differentiate themselves by size (the more important one is `font.hero`, the secondary is `font.amountLarge`) and by being in `color.accent` (since they're money) — not by sitting on a colored background.

### Transaction Rows

- Icon tile: `radius.full`, 8%-tint category background, category-mark-colored icon
- Merchant name: `font.body`, `color.ink`
- Subtitle: `font.caption`, `color.inkSoft`
- Amount: `font.amountRow`, tabular, `color.accent` for debit, `color.success` for credit — **text color only, never a colored chip background**
- Rows separated by `color.line`, not individual card shadows

### Buttons

| Variant | Treatment |
|---|---|
| Primary | `color.accent` fill, white text, `radius.full`, `shadow.raised` only on the FAB |
| Secondary | `color.surface` fill, `color.ink` text, `shadow.card` (no border) |
| Ghost / icon-only | transparent, `color.ink` icon, `color.surfaceSunken` on press |
| Destructive | `color.danger` text on `color.dangerSoft` fill, `radius.full` |

### Dropdowns / Pickers

Same rounded, shadow-card surface as everything else — `radius.md`, `shadow.card` + `shadow.cardAmbient`, white background, selected row gets `color.accentSoft` background with `color.accent` check icon. (This is the component from the SelectDropdown bug fix earlier — visually it now matches the rest of the system instead of using its own ad hoc shadow/border combination.)

### Empty States (Lottie-Based Shared Component)

Empty states are the one deliberate exception to the monochrome rule — a small contained animation is allowed full color here, as a moment of warmth on an otherwise restrained screen. Every empty state in the app uses the **same component**, configured per context. The component is not redesigned per screen; only its inputs change.

**Component contract:**

```
<EmptyState
  lottieSource={ /* per-context animation file */ }
  headline={ /* one line, context-specific copy */ }
  subtext={ /* max two lines, context-specific copy */ }
  actionLabel={ /* optional — omit entirely if no action unblocks this state */ }
  onAction={ /* optional, paired with actionLabel */ }
/>
```

**Fixed rules (apply to every instance, no exceptions):**

| Element | Spec |
|---|---|
| Container | `color.surface` card, same shadow/radius system as any other card (`shadow.card` + `shadow.cardAmbient`, `radius.md`) — an empty state still belongs to the page, it is not a special floating element |
| Lottie size | 64–80dp square, centered, contained — never a large centerpiece illustration. The animation should read as "a small icon that happens to be alive," not as decorative art taking over the card |
| Lottie loop behavior | Gentle, continuous, low-amplitude loop. No autoplay-loud entrance, no attention-seeking motion. It should reward a glance, not demand one |
| Lottie color | **Full color permitted** — this is the only UI surface in the entire system where multi-color illustration is allowed outside category icon tiles. Keep the palette warm/friendly but not clashing with `color.accent` |
| Headline | `font.h3` (Step 3), `color.ink`, one line, friendly tone |
| Subtext | `font.bodySoft` (Step 4), `color.inkSoft`, max two lines, explains what will make this state go away |
| Action button | Only included if a single clear action resolves the empty state. Small pill, `color.accent` fill, white text — same button spec as elsewhere. If no single action applies (e.g. "categories appear once you log something elsewhere"), omit the button entirely rather than forcing one |

**Configured instances (Home screen):**

| Context | Lottie | Headline | Subtext | Button |
|---|---|---|---|---|
| Top Categories — no spending yet | Small pie/category-ish icon animation | "No spending yet" | "Categories will show up here once you log an expense." | none — logging happens elsewhere, no direct action from this card |
| Recent Transactions — none logged | Small empty-wallet or receipt icon animation | "Nothing here yet" | "Your transactions will appear here automatically, or add one yourself." | "Add expense" → opens Add Transaction sheet |

**Rule:** when adding a new empty state anywhere else in the app (Budgets, Insights, Search results, etc.), reuse this exact component and follow the same fixed/configurable split above — do not design a new empty-state layout per screen. Only the Lottie file, headline, subtext, and optional action change.

---

## Animation Principles

Kept from the previous system — Reanimated 3 spring physics was never the problem, the visual layer was. Two changes:

1. **FAB idle pulse removed.** A breathing animation on a button competes with the restraint of the new system. The FAB stays still until touched.
2. **Card entrance animations stay subtle** — opacity + 8dp translateY, never scale-bounce on load. Bounce is reserved for confirmation moments only (successful save, budget milestone).

All gesture and interaction specs (swipe-to-delete, long-press multi-select, pull-to-refresh) carry over unchanged — they're interaction patterns, not aesthetic choices.

### Click / Press Feedback — Soft & Subtle (the default touch response for everything)

This system uses one universal press response, scaled by component weight. Nothing snaps hard, nothing bounces on a simple tap — bounce is reserved exclusively for success confirmations (see Component States below). Every tappable element softens slightly and settles, like pressing into a cushioned surface, not a mechanical switch.

```javascript
// Universal press-in (applies to cards, rows, buttons, chips, icons)
spring.press = {
  damping: 22,
  stiffness: 260,
  mass: 0.9,
}

// Press in
scale:    1.0 → 0.985        (spring.press — barely perceptible, never below 0.97)
opacity:  1.0 → 0.92         (120ms ease-out, runs alongside scale)
shadow:   shadow.cardAmbient → reduced 40% blur/offset   // shadow "settles" as if pressed down

// Press out (release, no action triggered yet)
scale:    0.985 → 1.0        (spring.press)
opacity:  0.92 → 1.0         (160ms ease-out)
shadow:   restores to full shadow.cardAmbient            (spring.press, same timing as scale)
```

**Why this scale range:** anything beyond ~0.96 reads as "the UI is collapsing," which feels mechanical and cheap. Capping at 0.985 keeps the feedback felt but never seen as a dramatic gesture — this is what makes press states feel "soft."

#### Component-specific press weight

| Component | Scale target | Notes |
|---|---|---|
| **Primary button (FAB, CTA)** | 0.97 | Slightly more pronounced — it's the one place a firmer press read is appropriate, since it's a deliberate commit action |
| **Card / row (tap to open detail)** | 0.985 | Barely-there — preserves the "soft" feeling for browsing actions |
| **Icon button (ghost)** | scale unchanged, opacity 1.0 → 0.6 only | No scale at all — icon buttons are small enough that scale reads as jittery; opacity dip is enough |
| **Chip / pill / category tag** | 0.97, plus background tint shift `transparent → color.surfaceSunken` | Tint reinforces the press without needing motion |
| **List swipe actions (delete/categorize reveal)** | unchanged from existing gesture spec | These are drag-driven, not tap-driven — covered separately |

#### Ripple is not used

No Android-style expanding ripple anywhere. Ripple is a Material Design signature and immediately reads as "default Android app" rather than a designed product. The scale+opacity+shadow response above replaces it everywhere, including on native-feeling list rows.

#### Haptics pairing

Every press-in that crosses scale 0.97 or below pairs with `Haptics.impactAsync(ImpactFeedbackStyle.Light)` — light only, never Medium/Heavy for routine taps. Medium/Heavy stay reserved for threshold-crossing moments already defined in the original animation spec (long-press activation, drag-to-reorder, budget breach).

---

## Consistency Rules

Read this before building or restyling any screen. These are the rules that were missing before — having tokens isn't enough if nothing enforces using them everywhere.

1. **Every screen's header is the same hero-card component.** No screen invents its own header treatment.
2. **Every card uses `shadow.card` + `shadow.cardAmbient`. Zero borders on outer card edges, ever.** If a component needs a border, it's wrong — use shadow.
3. **Exactly one `font.hero` element per screen.** If two numbers are competing for biggest-on-screen, one of them is wrong.
4. **Color is never decorative.** Before adding any color to a component, ask: "is this money, or is this an alert state?" If no, it's `color.ink`, `color.inkSoft`, or `color.inkFaint`.
5. **Radius comes from the 4-value scale only.** No one-off corner values.
6. **All amounts render with tabular figures.** No exceptions, including inside charts and dialogs.
7. **Spacing between sections is always `space.6` (24dp) minimum.** No screen gets to feel more cramped than another.

---

> *Design system rebuilt to replace the violet/Inter template. The previous version's animation and gesture specs (design-system.md v1) remain valid — only color, type, elevation, and radius systems changed.*
