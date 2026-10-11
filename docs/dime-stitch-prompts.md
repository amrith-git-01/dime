# Dime — Stitch Prompts (All Screens)

One file, appended to as we work through each screen. Paste the SYSTEM block
once per Stitch session, then paste each screen's prompt as we finish
brainstorming it.

---

## SYSTEM (paste once per session, before any screen)

```
Design a modern Android expense-tracking app called "Dime." Light mode only.

AESTHETIC: Calm, confident, restrained fintech UI — closer to Mercury, Cash App,
or Monzo than typical AI-generated finance apps. No purple/violet gradients, no
pastel cards, no decorative banners. Trust is built through restraint, not
decoration.

COLOR RULES (strict):
- Background: near-white neutral #FAFAFA, no lavender/blue tint
- Cards: pure white #FFFFFF, elevated with soft two-layer shadow only, NEVER a
  border
- Text: ink black #14151A primary, #5B5D68 secondary/muted
- ONE accent color, deep indigo #2B3FE0 — used ONLY on: monetary amounts,
  primary buttons/FAB, selected/active states, progress bar fills
- Never use the accent as a background fill for headers or large card areas
- success green #1A8754 (credits/positive, text only), danger red #D6394A
  (overspend, text only), warning amber #B5790A (80% threshold, text only) —
  small text/badge use only, never large fills
- Category icons sit in a pale ~8%-tint circular tile matching their own muted
  color, icon stroke in full category color — the only place multiple colors
  appear

TYPOGRAPHY:
- ONE distinctive geometric grotesk sans-serif for everything (not Inter, not
  Roboto, not system font) — confident weight contrast, slightly squared
  letterforms
- All numbers use tabular/monospaced digit alignment
- Strict 4-step hierarchy per screen, exactly one "hero" element at the
  largest size:
  Step 1 Hero: ~40-44sp, weight 700 — ONE per screen only
  Step 2 Primary: ~24-28sp, weight 650-700 — section amounts, titles
  Step 3 Secondary: ~15-16sp, weight 450-600 — row content, body text
  Step 4 Tertiary: ~11-12sp, weight 450-600, often uppercase+letterspaced —
  labels, captions, timestamps

SURFACES & SHAPE:
- Every card uses soft stacked shadow elevation, never a border
- Fully rounded corners throughout, generous radius (16-28dp), pills for
  buttons/chips
- Header is a plain white card with rounded BOTTOM corners only — not a
  gradient banner. Same shadow treatment as every other card.
- Generous spacing: 20dp screen padding, 24-32dp between sections

INTERACTION: all press states are soft and subtle — slight scale to ~0.985
(cards/rows) or ~0.97 (primary buttons), faint opacity dip, gentle spring
settle. No Android ripple. No bounce on routine taps — bounce reserved for
success confirmations only.

ICONS: thin stroke (1.5px), lucide-style line icons, never filled. Default
ink color; accent-indigo only for primary tappable actions.
```

---

## 1. HOME SCREEN

**Brainstorm summary:** Old home screen had two equal-weight "Spent Today" /
"Spent This Month" cards (the core hierarchy problem), a separate redundant
Cash Flow card, a one-row Top Categories section styled differently from
Recent Transactions, and an AI sparkle button floating awkwardly over a
transaction row.

Researched comparable apps before finalizing — pulled back from an early
draft that stacked everything (monthly, daily, spent, net) into one dense
hero card. Real precedents (Daily Wallet Limiter, the Pocket case study) and
general UX guidance consistently favor a few small/light elements over one
crowded one. Final structure: one true hero (monthly remaining), with daily
cap and spent/net demoted to progressively smaller, lighter elements beneath
it — hierarchy by size, not by nesting. Top Categories and Recent
Transactions now share one identical row component (icon tile, name, amount,
optional progress bar), per your call that they should look the same.

Empty states (when Top Categories or Recent Transactions have no data) use a
shared, reusable Lottie-based component — one component, configured per
context (different animation, headline, subtext, optional button). This is
the deliberate exception to the monochrome rule: a small, contained, full-
color animation is allowed here as a moment of warmth, while headline/
subtext/button still follow the standard type and color system. Documented
as a governed pattern in design-system.md so future empty states (Budgets,
Insights, etc.) reuse the same component instead of each screen inventing
its own.

```
Home screen for Dime, following the established system above.

STRUCTURE TOP TO BOTTOM:

1. HEADER (white card, rounded bottom corners only, soft shadow, no gradient):
   small circular avatar left, "Good afternoon" in muted gray above bold ink
   "Amrith" below it, two ghost icon buttons aligned right (settings gear,
   notification bell) — no filled circle backgrounds behind the icons.

2. HERO CARD (the single most important card on the screen — white, soft
   shadow, fully rounded ~28dp corners, generous internal padding):
   - Top row: small uppercase muted eyebrow label "THIS MONTH" on the left,
     month navigator "‹  Jun 2026  ›" on the right — two ghost arrow buttons
     flanking the month-year label, no dropdown, no picker sheet. Tap ‹ for
     previous month, tap › for next month. Label is display-only.
   - Below: ONE large hero number, ~42sp bold weight 700, tabular digits, in
     indigo accent color — "₹24,996" — this is the ONLY large number on the
     entire screen
   - Directly under the hero number, a smaller status line in muted gray
     medium weight: "left to spend · 0% used"
   - Below that, a thin fully-rounded progress bar, full card width, pale
     gray track with indigo fill showing percentage used
   - Nothing else in this card — keep it clean, just eyebrow + hero number +
     status line + progress bar

3. DAILY CAP STRIP (a visually smaller, slimmer card directly below the hero
   card — same white/shadow treatment but noticeably more compact, single
   row height, NOT another big card): small label "Daily" in muted gray on
   the left, tabular amount "₹4 / ₹900" in ink black (not indigo — this is
   clearly secondary to the hero) on the right, with a thin inline progress
   bar beneath spanning the card width, slightly smaller/thinner than the
   hero card's bar.

4. SECONDARY STAT ROW (small, lightweight, no card background needed — can
   sit directly on the page background or in one slim shared card): two
   compact stats side by side separated by a thin vertical divider —
   "SPENT" (muted uppercase label) with tabular amount "₹4" below in ink,
   and "NET" (muted uppercase label) with tabular amount "-₹4" below in
   danger red since it's negative. Small Step-4 sizing throughout — this row
   should feel like a quiet footnote under the daily strip, not a third
   competing card.

5. TOP CATEGORIES section: section header row with "Top categories" in bold
   ink (Step 2/3 weight) on the left and a small pill button "View all" in
   indigo text on a pale indigo-tinted background on the right. Below it, a
   single white shadowed card containing up to 3-4 ranked category rows
   separated by hairline dividers (not individual shadows per row): each row
   has a circular icon tile (pale ~8% tint of that category's color, icon
   stroke in full category color), category name in ink medium weight, thin
   rounded progress bar beneath the name showing share of budget, and a
   right-aligned tabular amount in ink black.

6. RECENT TRANSACTIONS section: section header row with "Recent
   transactions" in bold ink on the left, a small ghost sparkle/AI icon
   button next to a pill "View all" button on the right (the sparkle icon
   represents an AI assistant shortcut — give it a clear small tap target
   here, not floating loose over content). Below, a single white shadowed
   card containing up to 3-5 transaction rows using the EXACT SAME row
   layout/component as the category rows above (circular icon tile, name +
   small muted subtitle line for category/time, right-aligned tabular
   amount) — no progress bar on these rows since transactions don't have a
   percentage, but otherwise visually identical row styling to Top
   Categories for consistency. Amount in indigo for debit, green for credit.

7. BOTTOM: floating action button, solid indigo circle with white plus icon,
   soft indigo-tinted shadow, centered above a white bottom tab bar. Tab bar
   has 4 ghost icon tabs (home, transfer/swap, target/budget, list/insights),
   active tab in indigo with a small dot indicator beneath it, inactive tabs
   in muted gray.

CRITICAL: only the hero card's main number is large/Step-1-sized. The daily
strip and secondary stat row must visually read as clearly smaller/lighter
than the hero card — this is intentional information hierarchy, not a
layout accident. No gradients anywhere. No card borders anywhere — shadow
only. Category rows and transaction rows must use the identical visual
component, differing only in their header section and whether a progress
bar is shown.
```

### Empty states for Top Categories and Recent Transactions

When either section has no data, replace the row list with a shared empty-
state component (same component used in both places, only the content
config differs — this is the ONE place in the entire app where a small
colorful illustration is allowed, as a deliberate moment of warmth against
the otherwise monochrome system):

```
Empty state component (used identically in both Top Categories and Recent
Transactions when empty, sitting inside the same white shadowed card the
row list would otherwise occupy, same shadow/radius as every other card):

- A small (64-80dp), centered, gently looping Lottie animation — full color
  permitted here specifically, friendly and warm in tone, but small enough
  to read as "a small icon that's alive" rather than a large illustration
  taking over the card
- Below it, a one-line headline in ink black, medium-bold weight (Step 3
  size)
- Below that, muted gray subtext, max two lines, explaining what causes
  this state to resolve
- An optional small indigo pill button below the subtext — ONLY included
  when a single clear action would resolve the empty state

FOR TOP CATEGORIES (no spending yet):
- Lottie: small pie-chart / category icon style animation
- Headline: "No spending yet"
- Subtext: "Categories will show up here once you log an expense."
- No button (logging happens via the FAB / Add Transaction flow elsewhere,
  not from this card directly)

FOR RECENT TRANSACTIONS (none logged):
- Lottie: small empty-wallet or receipt icon style animation
- Headline: "Nothing here yet"
- Subtext: "Your transactions will appear here automatically, or add one
  yourself."
- Button: small indigo pill "Add expense"
```

---

## 2. TRANSACTIONS SCREEN

**Brainstorm summary:** Old screen had three core problems: a violet gradient
header (going away globally), a redundant "CASH FLOW / CREDITED / DEBITED /
NET" card that duplicated the Home screen's month summary, and a day navigator
that was just `← June 20, 2026 →` arrows — the most generic pattern possible
with zero spatial context.

Research into Cashio, Monzo, and uCal surfaced two real divergent answers:
continuous scrolling feed (Monzo) vs calendar-first navigation (Cashio). Chose
calendar-first because it communicates data visually — spending intensity at a
glance without tapping — and is completely distinctive from every Indian
expense app currently using arrow navigation.

Key structural decisions:

- The Cash Flow card (CREDITED / DEBITED / NET) is removed entirely. Home
  already owns monthly context; this screen owns the daily log.
- Month selector is integrated inside the calendar card header (not a separate
  strip above it) — fewer elements, same information.
- The selected day's date label and total live as the header row inside the
  transaction list card itself (Option 2), so the total reads as "context for
  this list" not a floating orphan between two cards.
- Manual / Receipt / Voice capture entry points move into the FAB fan (same as
  Home), removed from inline colored pills in the screen.
- Empty state uses the same shared Lottie-based EmptyState component as Home —
  consistent, no new visual vocabulary.

The heatmap's spending intensity uses the single accent color at varying
opacities (12% / 28% / 55%) — monochrome-safe, purely data-driven, no
additional colors introduced.

```
Transactions screen for Dime, following the established system above.

STRUCTURE TOP TO BOTTOM:

1. HEADER (identical to Home — white card, rounded bottom corners only, soft
   shadow, no gradient): small circular avatar left, greeting + name, two
   ghost icon buttons right (settings gear, notification bell). Same component,
   no changes.

2. CALENDAR CARD (white card, soft shadow, fully rounded ~28dp corners,
   generous internal padding — this is the navigation and data visualization
   combined):

   CARD HEADER ROW (inside the card, at the top):
   - Center: month-year label "June 2026" — display only, no dropdown.
   - Left of label: ghost arrow button "‹" for previous month.
   - Right of label: ghost arrow button "›" for next month.
     Same ‹ label › pattern as the Home hero card and all other
     month-navigated screens. No picker bottom sheet.
     month jumps without opening the picker. Thin stroke, ink color, small
     tap target (~36dp), no background circles.

   WEEKDAY LABEL ROW (below header row):
   - Seven columns: M  T  W  T  F  S  S
   - Step 4 uppercase, color.inkFaint, centered per column
   - No background, no borders — just labels

   DAY GRID (below weekday labels):
   - 7 columns × 4–6 rows depending on month
   - Each day cell is a ~36dp circle, centered in its column slot
   - Day number text: Step 4 size, tabular digits

   DAY CELL STATES (critical — this is the heatmap, monochrome-safe):
   - No transactions: day number in color.inkFaint, no circle background
   - Low spend: day number in color.ink, circle background at color.accent
     8-12% opacity
   - Medium spend: day number in color.ink, circle background at color.accent
     25-30% opacity
   - High spend: day number in white, circle background at color.accent
     55-65% opacity (solid enough that white text reads clearly)
   - Selected day: solid color.accent fill, white day number, weight 700
   - Today (unselected): thin color.accent ring border only, no fill, day
     number in color.accent
   - Today + selected: solid color.accent fill (selected state wins visually)
   - Days outside current month (leading/trailing): not shown or very faint

   CRITICAL: spending intensity thresholds adapt per user — low/medium/high
   are percentile-based on that user's own history, not hardcoded rupee
   amounts. A user who spends ₹50/day and one who spends ₹5000/day should
   both see meaningful intensity variation.

   No borders on the card. No grid lines between cells. White space does the
   separation. The calendar should feel airy, not like a spreadsheet.

3. TRANSACTION LIST CARD (white card, soft shadow, radius ~20dp — sits
   directly below the calendar card with standard 24dp gap):

   CARD HEADER ROW (inside the card, at the top — this is where the selected
   day context lives, NOT a separate floating element between cards):
   - Left: "June 20" in Step 3 ink medium weight. If selected day is today,
     append a small "· Today" in color.inkSoft at the same size.
   - Right: total for the day, e.g. "-₹1,240" in Step 3 weight 600, tabular,
     color.accent for net spend, color.success if it was a net income day
   - A color.line hairline divider below this header row, full card width

   TRANSACTION ROWS (below the hairline, inside the same card):
   - Each row uses the EXACT SAME row component as Home's Recent Transactions
     section — circular icon tile (color-mix of category mark at 8% tint,
     full-color icon stroke, radius.full), merchant name in Step 3 ink
     medium weight, subtitle line "Category · HH:MM" in Step 4 color.inkSoft,
     right-aligned tabular amount in color.accent for debits / color.success
     for credits
   - Rows separated by color.line hairline dividers — no individual shadows
     per row
   - The card carries the shadow once for the entire list
   - No progress bars on these rows (unlike Home's Top Categories rows) —
     transactions don't have percentages

   DAY TOTAL FOOTER ROW (bottom of the card, after all rows):
   - A color.line hairline above it
   - Left: "N transactions" in Step 4 color.inkFaint
   - Right: net total for the day in Step 4 color.inkSoft
   - This row is deliberately quiet — it's a receipt footer, not a headline

4. EMPTY STATE — when selected day has zero transactions (replaces the
   transaction list card entirely, same shadow and radius):
   - Same shared Lottie-based EmptyState component as Home
   - Lottie: small receipt or empty-wallet animation (~64-72dp), full color
     permitted
   - Headline: "Nothing on this day" — Step 3, color.ink
   - Subtext: "Navigate to another day or add a transaction." — Step 4,
     color.inkSoft, max two lines
   - Button: small indigo pill "Add expense" — opens Add Transaction sheet

5. BOTTOM: same FAB and tab bar as Home. FAB fans out to Manual / Receipt /
   Voice on press — these are NOT inline pills in the screen body anymore.
   Active tab indicator on the Transactions tab icon.

INTERACTION NOTES:
- Tapping a day cell: spring-animates the selection fill to the new cell,
  transaction list card content cross-fades to that day's data. No full
  page transition — the card updates in place.
- Swiping left/right on the calendar grid advances to next/prev month with
  a horizontal slide transition inside the calendar card only.
- Swiping left on a transaction row reveals a destructive delete action
  (danger red, trash icon) per the design system gesture spec.
- Press state on day cells: scale 0.97, opacity 0.85, spring settle — same
  press spec as chips/pills.

CRITICAL RULES FOR THIS SCREEN:
- The Cash Flow / CREDITED / DEBITED / NET block does not appear anywhere.
  Home owns month-level context. This screen owns daily log browsing.
- The calendar card's month label + arrows are the ONLY navigation chrome.
  No separate month pill strip above the calendar.
- The selected day total lives ONLY inside the transaction list card header
  row — not as a standalone floating element between cards.
- No colored backgrounds anywhere except category icon tiles and the
  accent-opacity day cells in the heatmap.
- No card borders anywhere — shadow only.
- Day cells must never use multiple hue colors for intensity — only the
  single accent #2B3FE0 at varying opacities. This is the monochrome rule
  applied to data visualization.
```

### Empty state — no transactions at all in the selected month

When the entire month has zero transactions (not just the selected day):

```
The calendar grid still renders with all day cells empty (inkFaint numbers,
no circles). The transaction list card area shows the EmptyState component:

- Lottie: empty calendar / receipt animation
- Headline: "No transactions in June"
- Subtext: "Add your first transaction or navigate to a month with data."
- Button: "Add expense"
```

---

## 3. TRANSACTION DETAIL MODAL

**Brainstorm summary:** The existing Transaction Detail is a separate stack
screen (push navigation) — overkill for content this shallow. It had a
redundant mini-row card at the top (repeating the transaction row the user
just tapped) and boring ALL CAPS labeled fields (WHEN / DETECTED VIA /
COUNTERPARTY / NOTES) with no visual personality.

Decision: replace the stack screen entirely with an origin-aware floating
modal. The modal expands from the exact position of the tapped transaction
row — same pattern the agent chat overlay uses when expanding from the FAB,
implemented in Reanimated with no additional library. The underlying
Transactions screen stays mounted under the scrim throughout (modal
presentation, not a stack push), preserving spatial context.

Key structural decisions:

- Full floating card modal, NOT a bottom sheet. All four corners rounded,
  scrim behind it, centered on screen. Feels like a receipt card hovering
  in space, not a drawer sliding up from the bottom.
- No Edit / Delete actions for now — detail view only, actions deferred.
- The amount is the hero (Step 1) — this is the most important number in
  a transaction detail and earns the largest size here.
- One visual personality cue: a dashed horizontal separator between the
  header section and metadata rows. Thematically appropriate (a transaction
  IS a receipt), adds character without decoration.
- Metadata rows use icon + label + value layout — replaces ALL CAPS field
  labels with scannable inline rows.
- The redundant top mini-card is removed entirely — the modal IS the detail
  view, it doesn't need to re-show the list row.

```
Transaction detail modal for Dime, following the established system above.

PRESENTATION & ANIMATION:

This is not a screen push. It is a floating modal overlay that expands from
the position of the tapped transaction row using Reanimated spring physics:

- On row tap: measure the row's absolute position (pageX, pageY, width,
  height) on screen
- Modal enters animating FROM those row dimensions TO its final centered
  position: starting scale near zero at the row's Y position, expanding to
  full modal size centered on screen
- Border radius springs from the row's radius (~20dp) to the modal's
  radius.lg (~28dp) simultaneously
- Scrim fades in behind the modal: opacity 0 → 0.45, ~200ms ease-out
- All driven by spring physics (damping ~20, stiffness ~200) — same spring
  constants used elsewhere in the app
- Dismiss options: tap the scrim, or tap the ✕ ghost button inside the
  modal — reverse animation, modal springs back to the row's original
  position, scrim fades out, modal unmounts on completion

MODAL CARD DIMENSIONS & POSITION:
- Width: screen width minus 2 × 24dp horizontal margin (not edge-to-edge)
- Height: fits content — not full screen, not a fixed height. Tall enough
  to show all metadata rows comfortably, short enough to feel like a card
- Corners: radius.lg (~28dp) all four corners — fully rounded floating card
- Background: color.surface (#FFFFFF), soft shadow.card + shadow.cardAmbient
  stacked — same shadow treatment as every other card in the app
- No border anywhere on the outer card edge

MODAL CONTENT, TOP TO BOTTOM:

1. CLOSE BUTTON (top-right corner of the modal, inside the card):
   - Ghost ✕ icon button, lucide X icon, 20dp, color.inkSoft, no background
   - 36dp tap target, positioned in the top-right corner with standard
     internal padding

2. HEADER SECTION (centered, inside the card):
   - Large category icon tile: 64dp circle, radius.full, category mark
     color at 8% opacity tint background, full-strength category mark color
     icon stroke at 1.5px, centered horizontally — this is visually larger
     than the 36dp version in list rows, acting as the visual anchor of the
     modal
   - Merchant name: Step 2 size (~24-26sp), weight 650, color.ink, centered,
     one line
   - Subtitle: category name in Step 4, color.inkSoft, centered — no
     timestamp here, timestamp lives in the metadata rows below
   - Hero amount: Step 1 (~42-44sp), weight 700, tabular digits, centered —
     color.accent (#2B3FE0) for expenses/debits, color.success (#1A8754) for
     income/credits. This is the ONLY Step 1 element in the modal.
   - Transaction type badge: small pill directly below the amount —
     "Expense" on color.accentSoft background with color.accent text, or
     "Income" on color.successSoft background with color.success text.
     radius.full pill, Step 4 size, weight 600. Centered.

3. DASHED SEPARATOR (between header section and metadata section):
   - A full-width horizontal dashed line — NOT a solid hairline
   - Dashed style: short dashes, color.line — this is the receipt "tear
     line" moment. The one visual personality cue in the modal.
   - Top and bottom margin of ~20dp from the content above and below it

4. METADATA ROWS (below the dashed separator):
   Each row uses a 3-column inline layout: icon left, label center-left,
   value right-aligned. Rows separated by solid color.line hairlines.

   Row 1 — When:
   - Icon: clock (lucide Clock), 16dp, color.inkFaint
   - Label: "When" in Step 4, color.inkSoft
   - Value: "20 Jun 2026 · 4:40 PM" in Step 3, color.ink, tabular digits
     for the time portion

   Row 2 — Via:
   - Icon: zap (lucide Zap for manual, lucide ScanLine for SMS/receipt,
     lucide Mic for voice), 16dp, color.inkFaint
   - Label: "Via" in Step 4, color.inkSoft
   - Value: "Manual" (or "SMS", "Voice", "Receipt") in Step 3, color.ink

   Row 3 — Counterparty:
   - Icon: user (lucide User), 16dp, color.inkFaint
   - Label: "Counterparty" in Step 4, color.inkSoft
   - Value: counterparty name in Step 3, color.ink

   Row 4 — Notes (only shown if a note exists, hidden entirely if empty):
   - Icon: file-text (lucide FileText), 16dp, color.inkFaint
   - Label: "Notes" in Step 4, color.inkSoft
   - Value: note text in Step 3, color.ink — this row uses a stacked layout
     (label on one line, note text as a full-width second line below it)
     since note text can be multi-line

SCRIM:
- Full-screen semi-transparent overlay behind the modal
- Color: rgba(20, 21, 26, 0.45) — ink-tinted, not pure black
- Tap anywhere on the scrim to dismiss

CRITICAL RULES FOR THIS MODAL:
- This replaces the stack screen entirely — no navigation push, no back
  arrow, no screen-level header.
- The redundant mini transaction row card (currently at the top of the
  detail screen) is completely removed.
- No Edit or Delete action buttons in this version.
- The amount is the only Step 1 element — merchant name is Step 2,
  everything else is Step 3 or Step 4.
- The dashed separator is the ONLY decorative departure from solid hairlines
  — do not add more decorative borders, textures, or shapes.
- No gradients, no colored backgrounds except the category icon tile tint
  and the small type badge pill.
- No card border on the outer modal edge — shadow defines the surface.
```

---

## 4. BUDGET SCREEN (Main)

```
CONTEXT:
The Budget tab is a scrollable overview of monthly spending vs. limits.
It has two states — no budget set, and budget active — and a category list
below the summary card in both states.

PROBLEMS WITH THE OLD SCREEN (remove all of these):
- "0% used" / "76% used" as the hero: a ratio about the past, not actionable.
  The user's real question at this screen is "can I still spend?" Replace with
  remaining amount as Step 1 hero.
- 3-stat row (Budget | Spent | Remaining) when budget is set: if remaining is
  already the hero, showing it a second time in the stat row is redundant.
  Collapse to 2 stats: Budget and Spent only.
- "No budget" state confusion: showing "Budget: — | Spent: ₹100 | Remaining: —"
  with a "Set budget" button is cluttered. When no budget is set, the entire
  stat row is meaningless. Replace with a single centered spend amount and a
  clear CTA.
- "Share of monthly budget" subtitle on every category row: vague, gives no
  number. Replace with quantitative context per row.
- Category tile opacity too high: currently ~13% color tint. Spec is 8%
  (${color}14, not ${color}22).
- Category list is unsorted: sort by spentMonth descending so highest-impact
  categories float to the top.
- TwoToneEmptyState: replace with the shared Lottie EmptyState component.

─────────────────────────────────────────────

STRUCTURE, TOP TO BOTTOM:

1. HEADER CARD (white, rounded bottom corners only, shadow — identical to
   Home and Transactions headers):
   - Left: "Budget" title in Step 3, color.ink
   - Right: month navigator "‹  Jun 2026  ›" — ghost prev/next arrows
     flanking the month-year label. No dropdown, no picker sheet.
     Same pattern as Home, Transactions, and Analytics screens.

2. MONTHLY SUMMARY CARD (white, shadow, radius.lg, 20dp horizontal screen
   padding, 16dp vertical padding):

   STATE A — BUDGET SET:
   - Step 4 uppercase label: "MONTHLY REMAINING" (color.inkSoft)
   - Step 1 hero: remaining amount in tabular digits, weight 700
     → color.accent (#2B3FE0) when positive remaining
     → color.danger (#D6394A) when over budget (shows "₹X,XXX over" framing)
   - Progress bar: full width, 8dp height, radius.full
     → accent fill when within budget
     → danger fill when over 100%
   - Small inline status pill, directly below the progress bar, radius.full:
     → "76% used" (neutral text on color.line background) — normal
     → "83% — watch it" (color.warning text on warning 8% tint) — >80%
     → "112% — over budget" (color.danger text on danger 8% tint) — >100%
   - Hairline separator (color.line)
   - 2-stat row: [Budget  ₹25,000] [vertical hairline] [Spent  ₹6,760]
     Both labels in Step 4 muted. Both values in Step 3 tabular weight 600.
   - Pencil ghost button: top-right corner of the card, 32dp tap target,
     icon Edit3 16dp color.accent — navigates to Budget Limits screen

   STATE B — NO BUDGET SET:
   - Step 4 uppercase label: "THIS MONTH — JUN 2026" (color.inkSoft)
   - Step 2 centered: total spent amount in tabular digits, weight 700,
     color.ink (not accent — no budget context means no accent signal)
   - Step 4 muted below: "spent so far · no budget set"
   - Full-width accent pill button: "Set monthly budget"
     (radius.full, color.accent background, white text, Step 3 weight 600)
   - No progress bar, no stat row, no pencil icon in this state

3. CATEGORIES SECTION HEADER (20dp horizontal padding, 12dp top gap from
   summary card):
   - Left: "CATEGORIES" in Step 4 uppercase + letterspaced, color.inkSoft
   - Right: "Add custom +" ghost button — small, Step 4, color.accent, no
     background, navigates to Create Custom Category screen

4. CATEGORY LIST CARD (white, shadow, radius.md, 20dp horizontal padding):
   Contains all category rows. Each row separated by a hairline (color.line).
   Rows sorted by spentMonth descending.

   CATEGORY ROW:
   - Left: category icon tile, 46dp × 46dp, radius.md (12dp), category color
     at 8% opacity background (${color}14), category icon stroke at full
     color, 18dp, strokeWidth 1.5. Pencil edit badge (24dp circle, white
     background, neutral border, Pencil icon 13dp color.inkSoft) positioned
     top-right of tile — only shown on budget tab when row is editable.
   - Center: category name in Step 3 weight 500 color.ink, subtitle below in
     Step 4 color.inkSoft:
     → Has own category cap: "cap ₹3,000" (the actual cap amount)
     → No category cap, monthly budget exists: "12% of budget" (computed %)
     → No budget, no cap: omit subtitle entirely
   - Right: spent amount in Step 3, tabular, weight 600, color.ink. Below
     amount: progress bar 68dp wide, 6dp height:
     → Global monthly share: accent indigo fill
     → Per-category cap: that category's own color fill
     → Warning (>80% of cap): color.warning on amount text
     → Over cap: color.danger on amount text, danger fill on bar
     No progress bar shown when no budget and no category cap.

5. EMPTY STATE (when no categories):
   - Shared Lottie EmptyState component: small contained animation,
     title "No categories yet",
     subtitle "Add a custom category to start tracking."

INTERACTION NOTES:
- Tapping a category row: navigates to filtered transaction list for that
  category and month (existing behavior, keep).
- Tapping the pencil badge on a category row: opens Edit Custom Category
  screen for that category.
- Tapping "Add custom +": opens Create Custom Category screen.
- Month selector dropdown: same behavior as Home and Transactions screens.
- Tapping the pencil button on the summary card: navigates to Budget Limits.
- Tapping "Set monthly budget" CTA: navigates to Budget Limits.

CRITICAL RULES FOR THIS SCREEN:
- The remaining amount IS the hero (Step 1). Percentage is a secondary pill.
- When budget is set: only 2 stats (Budget + Spent), never 3.
- When no budget: no stat row, no progress bar, only spend + CTA.
- Category tile tint is 8% (${color}14), never higher.
- Progress bar color grammar: accent = global monthly share, category color =
  per-category cap. Never use category color for global budget share bars.
- Sort categories by spentMonth descending, always.
- No TwoToneCard, no pastel backgrounds. One accent only: #2B3FE0.
- Shadow defines card surfaces — never borders on cards.
```

---

## 5. BUDGET LIMITS SCREEN (Set / Edit Daily + Monthly Caps)

```
CONTEXT:
A full stack screen (push navigation) reached from:
  (a) the summary card CTA when no budget is set
  (b) the pencil button when a budget exists
isEditMode flag changes the header title and save button label only.
The step slider with preset ticks is excellent UX — keep mechanics entirely.
Daily and monthly caps are independent of each other — keep this design.

PROBLEMS WITH THE OLD SCREEN (remove all of these):
- TwoToneCard container (pastel header zone + white body): violates monochrome.
  Replace with a single #FAFAFA screen background and white shadow card.
- Colored cap tiles (teal/blue solid backgrounds): biggest violation.
  Replace with white shadow cards, radius.md, neutral.
- Inline title text ("Budget limits" / "Update budget limits"): the stack
  navigation header already shows this title. Remove the redundant inline
  Text element.
- Description copy is wordy: "Slide to a preset or choose Custom. Daily and
  monthly caps stay independent." Replace with tighter copy (see below).
- Slider track fill uses opacity: 0.4 hack: replace with solid accent indigo.
- "Clear" button has no visual signal that it's destructive: make it
  danger red text (ghost, no background fill).

─────────────────────────────────────────────

STRUCTURE, TOP TO BOTTOM:

1. STACK NAVIGATION HEADER:
   - Back arrow (←) + title: "Budget limits" (set mode) or
     "Update limits" (edit mode)
   - Standard white header card, shadow, rounded bottom corners — same as
     all other stack screens in the app.

2. DESCRIPTION LINE (Step 4, color.inkSoft, 20dp horizontal padding,
   16dp top from header):
   "Slide to a preset or type a custom amount. Both caps are independent."

3. CAP TILES ROW (20dp horizontal padding, 12dp gap between tiles, 16dp
   top from description):
   Two cards side by side, equal width, white background, shadow, radius.md,
   16dp internal padding, centered content.

   DAILY CAP TILE:
   - Step 4 uppercase label: "DAILY CAP" (color.inkSoft), top of tile
   - Step 2 amount: tabular digits, weight 700, color.accent (#2B3FE0)
     centered — e.g. "₹0" or "₹1,500"
   - Step 4 muted description below: "warns when today exceeds this"
   - When Custom is selected and input is focused: tile gets a 1.5dp accent
     border (focus ring), same radius.md

   MONTHLY CAP TILE:
   - Step 4 uppercase label: "MONTHLY CAP" (color.inkSoft)
   - Step 2 amount: tabular digits, weight 700, color.accent, centered
   - Step 4 muted description below: "applies to every calendar month"
   - Same focus ring behavior on Custom input

4. DAILY CAP SLIDER (20dp horizontal padding, 24dp top from cap tiles):
   - Step 4 uppercase section label: "DAILY CAP" (color.inkSoft)
   - Slider rail: 5dp height, radius.full track
     → Inactive track: color.line
     → Active fill (left of thumb): solid color.accent (no opacity reduction)
   - Thumb: 26dp circle, white background, 2dp accent border, soft shadow
   - Preset ticks below the rail (500 · 1k · 1.5k · 2k · Custom):
     → Inactive tick: 10dp circle, color.line border, white fill
     → Active tick: 10dp circle, solid color.accent fill, no border
     → Inactive label: Step 4, color.inkFaint
     → Active label: Step 4, color.accent, weight 600
   - When "Custom" tick is active: the Daily Cap tile above becomes a live
     text input (existing behavior, keep). Tile gets accent focus ring.

5. MONTHLY CAP SLIDER (same structure as Daily, 24dp top gap):
   - Step 4 uppercase section label: "MONTHLY CAP"
   - Same slider mechanics, same color treatment
   - Presets: 15k · 20k · 30k · 40k · Custom

6. FOOTER (20dp horizontal padding, 24dp top from last slider, safe area
   bottom inset):
   Two buttons side by side:
   - Left: "Clear" — ghost button, Step 3, color.danger text, no background,
     radius.full border color.danger at 30% opacity. Signals destructive.
   - Right: "Save" (set mode) or "Update" (edit mode) — filled accent pill,
     color.accent background, white text, Step 3 weight 600, radius.full.
     Disabled state: 40% opacity.

INTERACTION NOTES:
- Dragging the thumb: smooth pan gesture on UI thread (existing Reanimated
  worklet behavior — keep entirely, no change).
- Tapping a preset tick: snaps thumb with spring animation (existing —keep).
- Custom tick selected: tiles animate to show a text input inline (existing
  focus behavior — keep). Tile gets accent focus ring while input is active.
- Haptic feedback on preset tick selection (light haptic — existing pattern).
- "Clear" resets both sliders to index 0 (₹0), both tiles reset.

CRITICAL RULES FOR THIS SCREEN:
- No TwoToneCard. Single #FAFAFA screen background.
- Cap tiles are white shadow cards — no color fills on the tile backgrounds.
- Cap tile amounts are Step 2, color.accent. Not Step 1 (they're side by side
  and would be cramped).
- Slider fill is solid accent indigo — never use opacity as a substitute for
  the correct color token.
- "Clear" is danger-colored (text only). "Save"/"Update" is accent filled.
- The stack nav header title is the only place the screen name appears —
  no duplicate inline title text.
- No new elements added. All existing mechanics preserved.
```

---

## 6. CUSTOM CATEGORY SCREEN (Create / Edit)

```
CONTEXT:
A full stack screen reached from:
  (a) "Add custom +" in the Budget screen section header → Create mode
  (b) pencil badge on a category row in the Budget list → Edit mode
In edit mode: fields may be disabled for system categories, a "Delete
category" option appears, and the save button reads "Update".
The live PREVIEW tile is the core UX feature of this screen — it reflects
name, icon, and color changes in real time as the user edits.

PROBLEMS WITH THE OLD SCREEN (remove all of these):
- TwoToneCard container (pastel header + white body split): violates
  monochrome. Replace with white shadow card on #FAFAFA background.
- Preview tile shell uses bento.sectionSurface background + border: replace
  with white shadow card, radius.md, no border. Shadow defines the surface.
- Hint copy "Icon uses your color; tile background is the list tint" is
  developer-speak. Replace with user-facing copy (see below).
- Field label "Monthly budget (optional)": terminology mismatch with the
  Budget Limits screen. Rename to "Monthly cap (optional)".
- Budget field hint is wordy: replace with tighter copy (see below).
- "Delete category" button is inline above the Clear/Save footer: destructive
  action sitting beside Save creates accidental tap risk. Move below the
  footer as a text link with extra spacing separation.
- Color chip selected state uses only a border color change: this is
  unreadable when the selected chip color is similar to the accent. Replace
  with the standard white ring gap + accent outer ring pattern.

─────────────────────────────────────────────

STRUCTURE, TOP TO BOTTOM:

1. STACK NAVIGATION HEADER:
   - Back arrow + title: "Custom category" (create) or "Edit category" (edit)
   - Same white header card, shadow, rounded bottom corners as all stack
     screens.

2. SCROLLABLE CONTENT (20dp horizontal padding):

   PREVIEW CARD (white, shadow, radius.md, 16dp internal padding):
   - Step 4 uppercase label: "PREVIEW" (color.inkSoft)
   - Live CategorySpendBentoRow preview: the actual row component with real-
     time name, iconName, and color props — same component used in the budget
     list. This is the honest preview: "this is exactly what it will look
     like." No separate icon display or mock.
   - Step 4 hint below the row: "This is how it'll appear in your budget list"
     (color.inkSoft)

   NAME FIELD (20dp top gap from preview card):
   - Step 4 uppercase label: "NAME"
   - Text input: placeholder "e.g. Pet care", autoCapitalize words,
     radius.md border color.line, 16dp internal padding, Step 3 color.ink
   - Standard TextField component (existing — keep mechanics, restyle)

   ICON PICKER (20dp top gap):
   - Step 4 uppercase label: "ICON"
   - Horizontal ScrollView, no scrollbar
   - Icon chips: 44×44, radius.sm, backgroundColor color.surface (near white)
     border color.line 1dp (neutral)
     → Selected: backgroundColor color.accent at 8% tint (#2B3FE014),
       border color.accent 1.5dp. Icon stroke color.accent in selected state,
       color.inkSoft in unselected state.
   - Haptic feedback on selection (existing — keep)

   COLOR PICKER (20dp top gap):
   - Step 4 uppercase label: "COLOR"
   - Horizontal ScrollView, no scrollbar
   - Color chips: 44dp circle, solid color fill
     → Unselected: thin 1dp border color.line
     → Selected: white ring gap (2dp) + accent outer border (2dp) — achieved
       via outline/box-shadow approach: inner shadow white 2dp, outer shadow
       color.accent 2dp. Works regardless of chip color. This is the
       standard color-picker selection pattern.
   - Haptic feedback on selection (existing — keep)

   MONTHLY CAP FIELD (20dp top gap):
   - Step 4 uppercase label: "MONTHLY CAP (OPTIONAL)"
   - Numeric text input: placeholder "e.g. 5000", keyboardType decimal-pad,
     radius.md, Step 3 color.ink
   - Step 4 hint below input (color.inkSoft):
     "No cap? Your spend shows as a share of your monthly total instead."

3. FOOTER (20dp horizontal padding, 24dp top from last field, safe area
   bottom):
   Two buttons side by side:
   - Left: "Clear" — ghost button, Step 3, color.inkSoft text, neutral border.
     No danger signal — clearing a category form is not destructive.
   - Right: "Save" (create) or "Update" (edit) — filled accent pill,
     color.accent background, white text, Step 3 weight 600.
     Disabled state when name is empty or at category limit: 40% opacity.

   DELETE LINK (edit mode only, 32dp top gap from footer buttons, centered):
   - "Delete category" in Step 3, color.danger, no background, no border.
     Tap opens a confirmation dialog before deleting.
   - Extra spacing (32dp) creates clear visual separation from the footer,
     signalling that this is not a peer action of Save.

INTERACTION NOTES:
- Name, icon, color fields all update the live PREVIEW tile in real time.
- Monthly cap field accepts numeric input only (sanitized, no letters, one
  decimal point max — existing sanitizeBudgetInput behavior, keep).
- In edit mode with fieldsDisabled=true (system categories): name, icon,
  color pickers are hidden or non-interactive; only monthly cap field and
  the footer are active.
- "Delete category" tap → confirmation dialog → on confirm: delete and pop
  back to Budget screen.

CRITICAL RULES FOR THIS SCREEN:
- No TwoToneCard. White shadow card for the preview section on #FAFAFA.
- Preview tile shell: white shadow card, no border. The live CategorySpend-
  BentoRow inside it is the exact component from the budget list — no mock.
- Color chip selected state: white ring gap + accent outer border (not just
  a border color change).
- "Monthly budget" renamed to "Monthly cap" everywhere in this screen for
  consistency with Budget Limits screen.
- Delete action is below the footer as a text link, never inline with Save.
- No colored backgrounds except category icon tile tint (8%) and selected
  icon chip tint (8% accent).
- No gradients, no pastel fills, no TwoTone surfaces.
```

---

## 7. CATEGORY TRANSACTIONS SCREEN (Filtered Transaction List)

```
CONTEXT:
A filtered transaction list showing all transactions for a single category
within a given month. Reached by tapping any category row on the Budget
screen. Also used for day-filtered and payee-filtered views (same screen,
different filter param). This brainstorm focuses on the category filter
variant but the design applies to all three filter types.

The screen receives: categoryId, categoryDisplayName, year, monthIndex0.
Rows are grouped into date sections, sorted by date descending.

PROBLEMS WITH THE OLD SCREEN (remove all of these):
- Alternating row background colors (primaryMuted / surfaceTint even/odd):
  creates a candy-stripe pattern that is visually noisy, aids no scanning
  task, and is the textbook "AI-generated app" tell. Remove entirely.
  Replace with the same pattern used on the main Transactions screen:
  all rows within a date section share one white shadow card, separated
  by hairlines.
- Header title "6 Transactions" loses context on navigation. The user is
  now away from the Budget screen — the header must remind them which
  category they are in. Title = category name. Count + period = subtitle.
- Category tag pill on every row is redundant. Every row in this screen
  belongs to the same category — showing a "Bits & Utilities" badge on
  every row is pure noise. Remove it. The second line becomes just the
  via label + time, making rows shorter and cleaner.
- Section date labels use bento.onPastel.muted color: change to
  color.inkSoft, consistent with all other date section headers.
- TwoToneEmptyState: replace with shared Lottie EmptyState component.
- Transaction tap navigates to TransactionDetail stack screen: replace
  with the origin-aware Transaction Detail Modal (Reanimated, expanding
  from tapped row position) — same behavior as the main Transactions tab.

─────────────────────────────────────────────

STRUCTURE, TOP TO BOTTOM:

1. STACK HEADER CARD (white, rounded bottom corners, shadow — same as all
   stack screens):
   - Back arrow (←)
   - Title: category name — e.g. "Bits & Utilities" — Step 3, color.ink
   - Subtitle: "[N] transactions · [Mon YYYY]" — Step 4, color.inkSoft
     e.g. "6 transactions · Jun 2026"
   No category icon in the header — keep it clean.

2. SCROLLABLE CONTENT (20dp horizontal padding, 16dp top from header):

   DATE SECTION (one group per calendar date, most recent first):

   SECTION HEADER ROW (between sections, 8dp bottom gap before card):
   - Left: date label — "TODAY" / "18 JUN" / "5 JUN 2026"
     Step 4 uppercase, letterspaced (0.5dp), color.inkSoft
   - Right: day net total — e.g. "–₹875"
     Step 4, tabular digits, color.danger for net debit,
     color.success for net credit, color.inkSoft if zero

   TRANSACTION LIST CARD (white, shadow, radius.md — wraps all rows for
   this date section):
   Each row separated by a hairline (color.line, full width).

   TRANSACTION ROW (inside the card):
   - Left: category icon tile, 36dp × 36dp, radius.sm (8dp), category
     color at 8% opacity background (${color}14), full-strength category
     icon stroke, 18dp, strokeWidth 1.5.
     Even in a single-category filtered list the icon tile is kept — it
     provides the visual anchor and left-edge rhythm for the row.
   - Center-top: merchant name — Step 3, weight 600, color.ink,
     numberOfLines 1, ellipsize tail. Time label on the right end of this
     same line — Step 4, color.inkFaint, tabular digits.
   - Center-bottom: via label only — Step 4, color.inkSoft
     ("Manual" / "SMS" / "Voice" / "Receipt").
     NO category tag. It is redundant — every row is the same category.
   - Right (amount column, always right-aligned):
     Amount — Step 3, tabular, weight 600.
     color.danger for expense/debit (–₹750)
     color.success for income/credit (+₹500)

   Row press state: soft spring scale to 0.985, faint opacity dip — same
   Reanimated press state as the main Transactions screen. No Android ripple.

   LIST FOOTER: spinner (ActivityIndicator, color.accent) when loading more
   pages — centered, 24dp vertical padding.

3. EMPTY STATE (no transactions match this filter):
   Shared Lottie EmptyState component.
   - Title: "No transactions here"
   - Subtitle:
     → category filter: "Nothing in [Category Name] for [Mon YYYY]."
     → day filter: "Nothing recorded on this day."
     → payee filter: "No transactions matched this payee."

INTERACTION NOTES:
- Tapping a transaction row: opens the Transaction Detail Modal —
  the origin-aware Reanimated modal that expands from the tapped row's
  position, with scrim behind. Tap scrim to dismiss. Same modal as the
  main Transactions tab.
- Infinite scroll / load more: screen auto-fetches next pages while prior
  results are visible (existing behavior — keep unchanged).
- List entrance stagger animation: keep existing stagger-in behavior.

WHAT IS NOT ON THIS SCREEN:
- No top summary card (total spent for the category). The count + period
  in the header subtitle is sufficient context. Adding a summary card
  above the list adds scroll friction before the first transaction is
  visible.
- No month picker/navigation. The user is locked to the month they drilled
  into from the Budget screen. They can go back and choose a different
  month from there.
- No search or filter controls. This is a focused drill-down view.

CRITICAL RULES FOR THIS SCREEN:
- No alternating row background colors. Single white shadow card per
  date section, hairline separators between rows only.
- Category tag removed from rows. The screen title already establishes
  the category — tags on every row are redundant.
- Transaction tap → Transaction Detail Modal only. No stack screen push.
- Header title = category name (not the count). Count goes in the subtitle.
- Row structure matches the main Transactions screen exactly, minus the
  category tag. Same icon tile, same typography hierarchy, same amounts.
- Section date header + day total on the right: always shown, provides
  the scanning hook for identifying recurring charges on specific dates.
```

---

## 8. ANALYTICS / INSIGHTS SCREEN

```
CONTEXT:
The Analytics tab is the "bigger picture" screen. Home answers "what's
happening today." Transactions answers "what did I spend on." Analytics
answers "how am I doing overall?" Three core user questions this screen
must answer in order:
  1. Am I ahead or behind financially this month? (net / savings rate)
  2. Am I burning through money faster than I should? (pace)
  3. Where is my money going, and when? (category + daily pattern)

This screen is a vertical scroll of data cards. Each card answers one
question. The order follows the user's mental hierarchy: summary →
pace → category breakdown → daily pattern → who → biggest hits →
compare.

PROBLEMS WITH THE OLD SCREEN (remove / fix all of these):
- Hero "36 transactions" is a count, not an insight. Replace with net
  cash flow as the Step 1 hero.
- 6 stats crammed into one card (Budget row + Cash Flow row): too dense.
  Redesign into a breathable card with one hero, a sparse 2-stat row,
  and a compact budget bar section.
- Dropdown/picker month selector: remove entirely. Replace with the
  global ‹ Jun 2026 › prev/next arrow navigation used everywhere.
- Daily chart has 4 colored lines (Expense, Income, Net+, Net-): four
  colors on one chart violates monochrome. Replace with a vertical bar
  chart in accent indigo — cleaner, more readable for discrete daily data.
- Donut uses random category colors: replace with a single-hue accent
  opacity scale (100% → 15%) so the chart feels intentionally monochrome.
- No category breakdown exists: the donut shows payees (who you paid)
  but nothing shows spending by category. Add a horizontal mini-bar
  category card as a new standalone section.
- Monthly pace card is text-only: add a visual pace bar that makes the
  "time elapsed vs budget consumed" mismatch immediately visible.
- TwoToneCard on Burn Rate and Top Expenses cards: replace with white
  shadow cards on #FAFAFA.
- Compare months card is a bare launcher: add an inline mini preview
  showing two proportional bars and a delta chip before the CTA.

MONTH NAVIGATION (global rule, applied on this screen):
All month-navigated screens use the ‹ label › pattern:
  ‹ ghost arrow  |  "Jun 2026" display label  |  › ghost arrow
No dropdown, no bottom sheet picker, no chevron. Tapping ‹ steps one
month back, › steps one month forward. Label is not tappable.

─────────────────────────────────────────────

STRUCTURE, TOP TO BOTTOM:

─────────────────────
CARD 1: MONTH SUMMARY
─────────────────────
White card, shadow, radius.lg, 20dp horizontal screen padding.

CARD HEADER ROW:
- Left: "THIS MONTH" — Step 4 uppercase, letterspaced, color.inkSoft
- Right: ‹  Jun 2026  › nav arrows, same ghost arrow style as all screens

HERO:
- Step 1 (~42sp, weight 700, tabular digits, centered):
  → Net cash flow = Income − Spend
  → Positive: success green (+₹72,178) — you came out ahead
  → Negative: danger red (−₹3,400) — you spent more than you earned
  → No income tracked: total spend in accent indigo (₹22,822)
- Step 4 label directly below hero (color.inkSoft):
  "76% saved · 36 transactions"
  → savings rate = (net / income) × 100, shown when income > 0
  → transaction count always shown
  → savings rate hidden if no income tracked (just count)
- MoM delta chip (radius.full pill, Step 4, beside the hero or below
  the label):
  "↑24% vs May" — danger 8% tint background, danger text when spending
                   increased
  "↓8% vs May"  — success 8% tint background, success text when decreased
  Hidden if no prior month data.

MINI SPARKLINE (between hero and stats row):
- A 36dp tall sparkline showing the daily expense curve for this month.
  Full card width, no axis labels, no tooltip — purely visual "shape of
  the month." Accent indigo line, 1.5dp stroke. Today's point is a
  small filled dot. Empty days are zero (line stays flat).
- This gives visual "month shape" context before the user scrolls to
  the full chart below.

STATS ROW (hairline separator above):
[Spent ₹22,822] [vertical hairline] [Income ₹95,000]
- Two stats only. Spent: Step 3, color.ink. Income: Step 3, color.success.
  Income stat hidden if income = 0 for the month.
- Both labels in Step 4 muted.

BUDGET SECTION (shown only when a monthly budget is set, hairline above):
- Progress bar: full width, 8dp, radius.full
  → accent fill when within budget, danger red when >100%
- Inline Step 4 text below bar:
  "Budget ₹25,000 · Remaining ₹2,178 · 91% used"
  → remaining turns danger red when over
- No separate Budget stat row — the bar + inline text is enough.


─────────────────────────────────
CARD 2: MONTHLY PACE (BURN RATE)
─────────────────────────────────
White card, shadow, radius.lg.

CARD HEADER:
- Title: "MONTHLY PACE" — Step 4 uppercase, color.inkSoft
- Subtitle: "How your spending tracks against an even daily rate"
  Step 4, color.inkFaint

VISUAL PACE BAR (the key addition):
Two layered bars stacked vertically, sharing the same track width:
  Track 1 — Time elapsed:
    Label "Day 20 of 30" on left, "67%" on right (Step 4, inkSoft)
    Thin bar (4dp), neutral gray fill at 67%
  Track 2 — Budget consumed:
    Label "Budget used" on left, "91%" on right (Step 4, inkSoft or
    warning amber if over-pace)
    Slightly thicker bar (8dp), accent fill at 91% (danger if >100%)

When the budget-used bar visibly overshoots the time-elapsed bar, the
over-pace signal is immediate without reading any number.

STATUS LINE (below the bars, Step 4):
  → On pace: "On track · ₹833/day ideal" — neutral ink
  → Over pace: "₹6,155 ahead of pace · watch it" — warning amber
  → Way over: "Projected to exceed budget by ₹9,234" — danger red

STATS ROW (hairline separator above):
[Spent so far ₹22,822] [·] [Ideal ₹16,667] [·] [Projected ₹34,234]
Labels: Step 4 muted. Values: Step 3 tabular weight 600.
Projected value → danger red when it exceeds monthly budget.

AVERAGE DAILY SPEND (below stats row, Step 4, color.inkSoft):
"₹1,141/day so far · ₹833/day ideal to stay on budget"
This row only appears when a monthly budget is set. Without a budget,
show "₹1,141/day average" only.


─────────────────────────────────────
CARD 3: CATEGORY BREAKDOWN (NEW)
─────────────────────────────────────
White card, shadow, radius.lg. This card does not exist in the current
app — it is a new addition.

CARD HEADER:
- Title: "BY CATEGORY" — Step 4 uppercase, color.inkSoft
- Subtitle: "Where your spend went this month" — Step 4, inkFaint

HORIZONTAL BAR ROWS (sorted by spend descending):
Each row:
- Left: category icon tile, 32dp, 8% color tint, full-color icon stroke
- Center-left: category name (Step 3, color.ink)
- Center bar: thin horizontal bar (6dp height, radius.full, accent
  indigo fill). Bar width is proportional to that category's share
  of total spend. The bar sits below the name on the same row
  conceptually — or inline if layout fits.
- Right: spend amount (Step 3, tabular, color.ink) + percentage label
  (Step 4, color.inkSoft) stacked vertically

Layout per row:
  [32dp icon]  Food & Dining          ₹2,840
               ████████████░░░░░░░░    22%
  hairline
  [32dp icon]  Utilities              ₹3,100
               █████████████░░░░░░░    24%
  ...

Show top 5 categories. "Show X more" collapse link at the bottom in
Step 4 accent text if more than 5 categories have spend.

Tapping a category row: navigates to Category Transactions screen
(filtered by that category + current month).

Empty state: Lottie EmptyState, "No category data yet"


────────────────────────────────────
CARD 4: DAILY CASH FLOW (CHART)
────────────────────────────────────
White card, shadow, radius.lg.

CARD HEADER:
- Title: "DAILY CASH FLOW" — Step 4 uppercase, color.inkSoft
- Subtitle: "Expense each day this month" — Step 4, inkFaint

CHART TYPE: vertical bar chart (replacing the 4-line chart).
Each calendar day of the month = one bar.

BAR VISUAL RULES:
- Bar fill: accent indigo (#2B3FE0), solid
- Bar width: proportional to available space (horizontally scrollable)
- Bar height: proportional to daily expense amount relative to month max
- Today's bar: stronger fill (100% opacity) or a small dot indicator
  above it
- Zero-expense days: no bar (just empty space, axis shows the date)
- Daily budget cap line (if set): thin horizontal dashed line across
  all bars at the cap amount — instantly shows which days exceeded
  the daily cap
- Income indicator: when income is recorded on a day, a small success-
  green dot appears above that day's bar. Income is not its own bar —
  it's a small overlay signal.

NET LINE (optional, below bars):
A thin flat line showing cumulative net (income − expense running total)
across the month. Success green when positive, danger red when negative.
Much simpler than the old 4-line chart.

AXIS:
- X: date labels, shown every 3-4 days to avoid crowding, "Today" label
  on current day. Scrollable horizontally (same as current).
- Y: compact INR labels on left gutter (₹5k, ₹10k).

TAP INTERACTION:
Tapping a bar shows a tooltip:
  "Jun 20 · Today"
  Expense: ₹1,240
  Income: —
  Net: −₹1,240
  [View day →]  ← navigates to day-filtered TransactionsList

LEGEND (below chart, Step 4):
  ■ Expense  · Income ●  [──── Daily cap]
  All in appropriate colors. Simple, not a full legend block.

SCROLL: same horizontal scroll behavior as current chart.
Auto-scrolls to show "today" on initial render.


──────────────────────────────────
CARD 5: WHO YOU PAID (DONUT)
──────────────────────────────────
White card, shadow, radius.lg.

CARD HEADER:
- Title: "WHO YOU PAID" — Step 4 uppercase, color.inkSoft
- Subtitle: "Debit spending by payee this month" — Step 4, inkFaint

DONUT CHART: same animated clockwise pie (existing mechanics, keep).
COLOR SCHEME — monochrome accent gradient:
  Slice 1 (largest):  #2B3FE0 at 100%  (full accent)
  Slice 2:            #2B3FE0 at 72%
  Slice 3:            #2B3FE0 at 50%
  Slice 4:            #2B3FE0 at 32%
  Slice 5 (smallest): #2B3FE0 at 18%
  "Other" slice:       neutral #C8C9D0
These are derived from a single hue — the chart feels intentional and
monochromatic, not a rainbow. Each legend tile matches its slice color.

LEGEND LIST (right of donut, same width as current):
  ■ Landlord Rajesh   41.6%  ₹9,508
  ■ Starbucks          9.2%  ₹2,144
  ■ BESCOM Electric    7.1%  ₹1,625
  ■ Cult.fit           5.5%  ₹1,250
  ■ Other             36.6%  ₹8,295

Tapping a slice or legend row: shows tooltip with payee name, amount,
percentage + "View →" link to payee-filtered TransactionsList.


──────────────────────────────────
CARD 6: TOP EXPENSES
──────────────────────────────────
White card, shadow, radius.lg.

CARD HEADER:
- Title: "TOP EXPENSES" — Step 4 uppercase, color.inkSoft
- Subtitle: "Largest debits this month" — Step 4, inkFaint

CONTENT: same Transaction List Row component, up to 5 rows.
- Category tag IS shown here (unlike Category Transactions screen)
  because this is a cross-category view — tag gives essential context.
- Hairline separators between rows.
- Rows sorted by |amount| descending.

Tap row → Transaction Detail Modal (origin-aware, expanding from row).
Empty state → Lottie EmptyState + quick-add CTAs (Manual / Receipt /
Voice — existing BentoRecentTransactionsEmptyInset behavior, keep).


──────────────────────────────────
CARD 7: COMPARE MONTHS (ENHANCED)
──────────────────────────────────
White card, shadow, radius.lg.

CARD HEADER:
- Title: "COMPARE MONTHS" — Step 4 uppercase, color.inkSoft
- Subtitle: "Stack two months side by side" — Step 4, inkFaint

INLINE MINI PREVIEW (new — before the CTA):
Two proportional vertical bars side by side, centered:
  Left bar: comparison month (e.g. May 2026) — neutral gray fill
  Right bar: current month (e.g. Jun 2026) — accent indigo fill
  Bar heights proportional to spend totals relative to the higher value.
  Below each bar: month label (Step 4) + amount (Step 3, tabular).
  Between bars: delta chip — "↑24%" in danger tint or "↓8%" in success tint.

This gives the user a preview of the comparison before navigating.

MONTH SELECTOR ROW (below the mini bars):
  [May 2026  ← →]    vs    [Jun 2026  ← →]
  Two ‹ label › inline nav controls, same arrow pattern as everywhere.
  Default: comparison = previous month, current = analytics selected month.

CTA BUTTON (below month selectors):
  Full-width accent pill: "View full comparison →"
  Navigates to InsightsMonthCompareScreen.


GLOBAL RULES FOR THIS SCREEN:
- No TwoToneCard anywhere. Every card is white shadow on #FAFAFA.
- No dropdown month picker anywhere. Only ‹ label › arrow navigation.
- Daily chart: vertical bars in accent indigo, NOT 4 colored lines.
- Donut: accent opacity gradient only, NOT random category colors.
- Hero: net cash flow (Step 1). Never transaction count as hero.
- Savings rate shown when income > 0. Hidden when no income tracked.
- MoM delta chip shown when prior month data exists. Hidden otherwise.
- All charts are horizontally scrollable as needed. Auto-scroll to today
  on initial render for date-based charts.
- Tapping any chart element (bar, slice, legend row) opens a tooltip
  with a "View →" link to the relevant filtered transaction list.
- Transaction tap in Top Expenses → Transaction Detail Modal. Not a
  stack screen push.
- New cards (Category Breakdown) follow the same white shadow card
  pattern and hairline row separator style as all other list cards.
```

---

## 9. COMPARE MONTHS SCREEN (InsightsMonthCompare)

```
CONTEXT:
A read-only stack screen reached from the Analytics tab's Compare Months
card. The user has selected two months (monthA = current, monthB =
comparison). The screen shows the same data categories as the Analytics
screen but renders them side by side for direct comparison.

The core question this screen must answer immediately:
"Which month was better, and by how much?"

Currently the only comparative signal is a small "∆ Spent ±₹3.9k (+15%)"
in 11pt muted text buried at the bottom of the first card. The user has
to mentally subtract two columns of raw numbers. Fix this by leading with
a hero snapshot card.

PROBLEMS WITH THE OLD SCREEN (remove / fix all of these):
- TwoToneCard used for every section: violates monochrome. Every card is
  replaced with a white shadow card on #FAFAFA background.
- Delta buried in footer text: the "which month was better" answer should
  be a hero card at the TOP, not a footnote.
- Net per column is just another small stat: Net / savings should be the
  Step 2 anchor of each column, not a peer of Spent/Income.
- Savings rate absent: mirrors the Analytics screen — add savings rate
  below net when income > 0.
- No category breakdown section: since Analytics now has one, Compare
  must mirror it.
- Daily cashflow uses 4-line multi-color chart: replace with vertical
  bar chart (accent indigo), shared Y-axis scale between both columns
  so bars are directly visually comparable.
- Donut uses random category colors: replace with accent opacity gradient
  (100% → 15%), same as Analytics screen.
- ComparePairedLayout header title in colors.primary (accent blue text):
  change to Step 4 uppercase color.inkSoft, consistent with all other
  card headers across the redesigned app.

COMPARE IS READ-ONLY:
No tappable charts, no drill-down navigation, no tooltips, no "View →"
links. The user came to observe, not navigate. This simplifies every
chart section — no gesture handlers, no tooltip overlays needed.

─────────────────────────────────────────────

STRUCTURE, TOP TO BOTTOM:

────────────────────────────────────────
CARD 0: COMPARISON SNAPSHOT (NEW — hero)
────────────────────────────────────────
White card, shadow, radius.lg. This card does not exist in the current
screen. It is the first and most important card.

CARD HEADER: "SPENDING COMPARISON" — Step 4 uppercase, color.inkSoft

TWO PROPORTIONAL BARS (centered, side by side, 24dp gap, 80dp tall each):
  Left bar:  monthB label (e.g. "May 2026")  — neutral gray fill
             ₹26,720 below bar in Step 3 tabular color.ink
  Right bar: monthA label (e.g. "Jun 2026")  — accent indigo fill
             ₹22,822 below bar in Step 3 tabular color.ink
  Bar heights are proportional to spend totals relative to the higher
  value. If Jun spent more, its bar is taller. Shared ceiling = max of
  the two spend values.
  Month labels sit above each bar in Step 4 uppercase color.inkSoft.

DELTA CHIP (centered, between the bar amounts row and the summary line):
  → When monthA spent LESS: success green chip — "↓15% vs May"
  → When monthA spent MORE: danger red chip   — "↑24% vs May"
  radius.full pill, Step 4 weight 600, semantic 8% tint background.

SUMMARY SENTENCE (Step 4, color.inkSoft, centered, below delta chip):
  → Better: "You spent less in Jun. Net flow also improved."
  → Worse:  "You spent more in Jun. Consider reviewing your pace."
  → Equal:  "Spending was nearly identical across both months."
  This line is the only text narrative on the screen. Keep it brief.

──────────────────────────────────────
CARD 1: MONTH SUMMARY
──────────────────────────────────────
White card, shadow, radius.lg.

CARD HEADER:
- "MONTH SUMMARY" — Step 4 uppercase, color.inkSoft
- "Spending, income, and net" — Step 4, color.inkFaint

COLUMN HEADERS (centered over each column):
  JUN 2026                 MAY 2026
  Step 4 uppercase, letterspaced, color.inkSoft

COLUMN CONTENT (left column = monthA, right column = monthB):

  NET ROW (top of each column):
  - Step 2 amount, tabular, weight 700
  - color.success when positive, color.danger when negative
  - A small "↑" badge (success) or "↓" badge (danger) appears beside
    the better month's net value — indicates which month had higher net
  - Step 4 label "NET" above the value

  SAVINGS RATE (directly below net, shown when income > 0 for that month):
  - "76% saved" in Step 4, color.inkSoft
  - Hidden if income = 0

  HAIRLINE SEPARATOR

  SUPPORTING STATS (Step 3, tabular):
  - Spent: color.danger
  - Income: color.success (hidden row if income = 0 for both months)

  HAIRLINE SEPARATOR (only if budget set)

  BUDGET GROUP (only shown when a monthly budget is set):
  - Used: percentage, danger tone if over 100%
  - Remaining / Over: semantic tone (success/danger/neutral)

COLUMN DIVIDER: vertical hairline (color.line) between the two columns.

──────────────────────────────────────
CARD 2: MONTHLY PACE
──────────────────────────────────────
White card, shadow, radius.lg. Same two-column stat layout as current,
only visual treatment changes.

CARD HEADER:
- "MONTHLY PACE" — Step 4 uppercase, color.inkSoft
- "How fast spending added up" — Step 4, color.inkFaint

COLUMN CONTENT (per column):
- Spent so far: Step 3 tabular. color.danger when over pace.
- Ideal: Step 3 tabular, color.ink.
- Projected: Step 3 tabular. color.danger when projected exceeds budget.
All labels in Step 4, color.inkSoft. Vertical gap between stats.

No structural changes from the current PaceColumn — only color/surface.

──────────────────────────────────────────
CARD 3: DAILY CASH FLOW (REDESIGNED CHART)
──────────────────────────────────────────
White card, shadow, radius.lg.

CARD HEADER:
- "DAILY CASH FLOW" — Step 4 uppercase, color.inkSoft
- "Expense each day" — Step 4, color.inkFaint
  (removed "income" and "net" from subtitle — simplified chart)

CHART TYPE: vertical bar chart (replaces 4-line multi-color chart).
Same change as the Analytics screen main chart, adapted for half-width.

TWO MINI BAR CHARTS, side by side:
  Left chart (monthB):  accent indigo bars, no Today marker
  Right chart (monthA): accent indigo bars, Today marker if current month

SHARED Y-AXIS SCALE — critical for visual comparison:
  Both charts use the same Y ceiling = max daily expense across both
  months. This means bar heights are directly comparable: a bar of the
  same height in both charts represents the same spend amount.

CHART DIMENSIONS at half screen width (~160dp each):
  Plot height: 120dp (reduced from full Analytics chart — readable at
  this width)
  X-axis: every 5th day labeled (1, 5, 10, 15, 20, 25, 30) to avoid
  crowding at half width.
  Y-axis: one label at the top (the shared max amount) — minimal.

No tap interaction. No tooltip. Read-only.

──────────────────────────────────────────────
CARD 4: CATEGORY BREAKDOWN (NEW — mirrors Analytics)
──────────────────────────────────────────────
White card, shadow, radius.lg. This section does not exist in the current
compare screen. Added to mirror the new Category Breakdown card on the
Analytics screen.

CARD HEADER:
- "BY CATEGORY" — Step 4 uppercase, color.inkSoft
- "Top spend categories" — Step 4, color.inkFaint

At half screen width, full horizontal bars are too cramped. Use a
simplified ranked list instead — top 3 categories per column:

COLUMN CONTENT (per column, top 3 by spentMonth desc):

  Each row:
  - 24dp category icon tile (8% tint, full-color icon)
  - Category name: Step 4, color.ink, numberOfLines 1
  - Amount: Step 4, tabular, color.ink
  - Narrow inline bar: full column width, 4dp height, radius.full,
    accent indigo fill proportional to share of that month's total spend

  Example:
    [icon] Utilities  ₹3,100
           ████████░░░░░░  24%
    [icon] Food  ₹2,840
           ███████░░░░░░░  22%
    [icon] Health  ₹1,075
           ██░░░░░░░░░░░░   8%

  Percentage label (Step 4, color.inkFaint) shown beside or below bar.
  No "Show more" — top 3 only in compare context.

No tap interaction. Read-only.

──────────────────────────────────────────
CARD 5: WHO YOU PAID (REDESIGNED DONUTS)
──────────────────────────────────────────
White card, shadow, radius.lg.

CARD HEADER:
- "WHO YOU PAID" — Step 4 uppercase, color.inkSoft
- "Debit spending by payee" — Step 4, color.inkFaint

DONUT CHARTS: two mini animated donuts side by side (existing mechanics,
keep). Update color scheme to monochrome accent gradient:
  Slice 1 (largest):  #2B3FE0 at 100%
  Slice 2:            #2B3FE0 at 72%
  Slice 3:            #2B3FE0 at 50%
  Slice 4:            #2B3FE0 at 32%
  "Other" / rest:     neutral #C8C9D0
Both left and right donuts use the same gradient scale independently
(the largest slice of each month gets 100%, regardless of absolute size).

LEGEND (below each donut, left-aligned within its column):
  ■ Payee name   ₹X,XXX  XX%
  Up to 3 entries per column, "Other" as last entry if applicable.
  Step 4, color.ink for name, tabular for amount.

No tap interaction on donuts. Read-only.

─────────────────────────────────────────────

GLOBAL RULES FOR THIS SCREEN:
- No TwoToneCard anywhere. Every card is white shadow on #FAFAFA.
  ComparePairedLayout must be refactored from TwoToneCard to a plain
  white shadow card with a card header section.
- Card section titles: Step 4 uppercase color.inkSoft. NOT colors.primary
  text. Consistent with all other redesigned screens.
- The comparison snapshot card (Card 0) is the hero — it must load first
  and is visible without scrolling.
- Read-only throughout — no gesture handlers on charts, no tooltips, no
  drill-down navigation from this screen.
- Shared Y-axis scale between the two cashflow charts is mandatory for
  honest visual comparison.
- Both donut charts use the accent opacity gradient independently
  (each month's largest slice = 100%).
- The ↑/↓ badge on the Net row indicates which month had higher net
  (better financial outcome), not just which number is higher.
- No month navigator on this screen — months were already chosen by the
  user in the Analytics tab launcher. The stack header title
  "Jun 2026 vs May 2026" is the only month reference needed.
```

---

## 10. SETTINGS SCREEN (Hub + Sub-screens)

```
CONTEXT:
The Settings tab is a simple hub screen with three areas: profile/account,
preferences (nav rows to sub-screens), and data actions. Navigation
structure is already correct — no structural changes needed. This is a
purely cosmetic monochrome update.

Sub-screens reached from here:
  SettingsAccount  → edit display name and avatar
  SettingsCapture  → automatic UPI capture preferences
  SettingsFeedback → feedback form

PROBLEMS WITH THE OLD SCREEN (fix all of these):
- SettingsHubHero uses bento.twoToneHeaderSurface background (lavender
  tint) + borderWidth: 1: replace with white shadow card, no border.
- "YOUR ACCOUNT" kicker in colors.brandPrimary (accent purple text):
  change to Step 4 uppercase, color.inkSoft.
- Avatar ring uses surfaces.primaryBorder28 (accent border): replace
  with a simple color.line neutral ring or remove entirely.
- Chevron wrap has surfaces.primaryTint10 circle background: remove the
  circle, show a plain ChevronRight in color.inkFaint.
- Icon wells on SettingsNavRow use per-row colors (teal, blue, etc.):
  replace with a uniform neutral well for all rows (see below).
- Section title typography uses old token: update to Step 4 uppercase,
  letterspaced, color.inkSoft — consistent with all section headers.
- Sign out button is a filled danger red button: change to ghost danger
  style (danger red border + danger red text, transparent fill) — still
  prominent and legible, but not visually alarming on every settings open.
- "Refresh from server" secondary button: update to neutral ghost style
  (color.ink text, color.line border) — secondary actions are not
  accent-colored in the monochrome system.
- Lede text Step 3 color.textSecondary → Step 4, color.inkSoft. Slightly
  lighter presence — it's context text, not body copy.

─────────────────────────────────────────────

STRUCTURE, TOP TO BOTTOM:

1. LEDE TEXT (below the stack/tab header, 20dp horizontal padding):
   "Profile, capture, and feedback — tuned for how you use Dime."
   Step 4, color.inkSoft. Unchanged copy, updated typography token only.

2. PROFILE / ACCOUNT CARD (SettingsHubHero, white shadow card, radius.lg,
   no border, 20dp horizontal screen padding):
   LAYOUT: horizontal row, 16dp internal padding, 16dp gap.

   Left: avatar image, 56dp circle (increased from ~48dp), no accent ring.
     Wrap: simple neutral ring — 2dp border color.line, radius.full.
   Center: text column (flex: 1)
     - Step 4 uppercase label: "YOUR ACCOUNT" — color.inkSoft (NOT accent)
     - Name: Step 2 (~22sp), weight 650, color.ink, numberOfLines 1
     - Subtitle: "Profile & display name" — Step 4, color.inkSoft
   Right: ChevronRight 20dp, color.inkFaint — NO circle background behind it

   Press state: spring scale to 0.985, opacity dip — same as all cards.
   Tapping navigates to SettingsAccount screen (unchanged behavior).

3. PREFERENCES SECTION:
   Section label: "PREFERENCES" — Step 4 uppercase, letterspaced,
   color.inkSoft (outside the card, above it, same as all section headers)

   WHITE SHADOW CARD (radius.md, shadow, contains both rows):

   SETTINGS NAV ROW — Automatic capture:
   SETTINGS NAV ROW — Send feedback:

   Each row layout:
   - Left: ICON WELL — 44×44dp, radius.md, uniform neutral background
     #F2F2F3 (barely-there near-white, same for ALL rows). Icon: 22dp,
     color.inkSoft, strokeWidth 2. No per-row accent colors.
   - Center: text column
     - Label: Step 3, weight 500, color.ink
     - Subtitle: Step 4, color.inkSoft, numberOfLines 2
   - Right: ChevronRight 20dp, color.inkFaint (no background)
   - Hairline separator between rows: color.line, inset to start after
     the icon well (indent matches existing ICON_WELL_SIZE + gap)

   Press state: opacity 0.88, no Android ripple.

4. DATA SECTION:
   Section label: "DATA" — Step 4 uppercase, letterspaced, color.inkSoft

   WHITE SHADOW CARD (radius.md, shadow):
   - Hint text inside card: Step 4, color.inkSoft, 16dp padding.
     "Clear offline cache and download the latest transactions, insights,
     and notifications from the server."
   - "Refresh from server" GHOST BUTTON (neutral): color.ink text,
     color.line border, radius.full, full width. Step 3, weight 500.
     Not accent-colored — secondary data action.

5. SIGN OUT BUTTON (20dp horizontal padding, 24dp top gap from Data):
   GHOST DANGER style:
   - Border: 1.5dp, color.danger
   - Text: color.danger, Step 3, weight 500
   - Background: transparent
   - radius.full pill, full width
   This replaces the filled danger button. Still clearly destructive,
   but not visually alarming on every settings open. Loaded (busy) state
   shows ActivityIndicator in color.danger.

─────────────────────────────────────────────

SETTINGS ACCOUNT SUB-SCREEN (SettingsAccount):
Stack screen: ← "Account"

This screen uses SettingsAccountEditor (TwoToneCard + form). Same fix:
- Replace TwoToneCard with white shadow card on #FAFAFA.
- Avatar preview section: centered avatar (80dp), neutral ring, "Shuffle"
  ghost button below it for refreshing the random avatar.
- Username field: standard TextField with Step 4 label "DISPLAY NAME".
- Clear / Save footer: same ghost neutral + accent filled pattern.
No structural changes — only cosmetic monochrome update.

─────────────────────────────────────────────

SETTINGS CAPTURE SUB-SCREEN (SettingsCapture):
Stack screen: ← "Automatic capture"
Uses SettingsCaptureEditor. Same treatment:
- Replace any TwoToneCard or pastel surfaces with white shadow card.
- Toggle rows use SettingsToggleRow — keep layout, update icon well to
  uniform neutral, accent-tinted thumb for the toggle switch.
- Section labels: Step 4 uppercase color.inkSoft.

─────────────────────────────────────────────

SETTINGS FEEDBACK SUB-SCREEN (SettingsFeedback):
Stack screen: ← "Send feedback"
Text input form. Keep structure, monochrome update only:
- Any TwoToneCard → white shadow card.
- TextField + submit button follow standard monochrome form pattern.

─────────────────────────────────────────────

CRITICAL RULES FOR THIS SCREEN AND ALL SETTINGS SUB-SCREENS:
- No TwoToneCard, no pastel/lavender backgrounds anywhere.
- All icon wells: uniform #F2F2F3 background, color.inkSoft icons.
  No per-row accent colors.
- "YOUR ACCOUNT" kicker: Step 4 uppercase color.inkSoft, never accent.
- Avatar ring: color.line neutral border only, no accent border.
- Chevron icons: color.inkFaint, no circle background.
- Sign out: ghost danger (border + text only, no fill).
- Secondary/refresh buttons: neutral ghost, never accent-colored.
- Section titles: Step 4 uppercase letterspaced color.inkSoft.
  Consistent with every other screen's section header pattern.
```

---

## 11. NOTIFICATIONS SCREEN

```
CONTEXT:
A stack screen reached from the bell icon in the Home header. Shows a
grouped inbox of app notifications: transaction captures, budget threshold
alerts, and capture failures. Filterable by All / Unread / Read.

The screen's job: scannable in 2 seconds. User sees what's new, marks it
read or deletes it, and gets back to the app.

PROBLEMS WITH THE OLD SCREEN (fix all of these):
- Filter tabs (NotificationsFilterTabs) use three equal-width bordered
  SegmentChip rectangles with accent background/border on selected state.
  This is the 2018-era segmented control pattern. Replace with a modern
  sliding-pill segmented control (see below).
- Icon wells use large-area color fills (full iconWellSky, iconWellOrange,
  iconWellDanger tinted backgrounds). Change to 8% semantic tint + full-
  strength semantic icon — whisper, not shout. Consistent with category
  icon tile pattern.
- No unread dot indicator: differentiation between unread and read rows
  is font weight + text color only — subtle and not scannable. Add a small
  6dp accent dot to the left of each unread row.
- TwoToneEmptyState: replace with shared Lottie EmptyState for all three
  empty states (inbox empty, filter empty).
- SettingsSection used as row container: section date headers should match
  the standard pattern (Step 4 uppercase, letterspaced, color.inkSoft).
  Row containers should be white shadow cards — same pattern as all other
  list screens in the redesign.

─────────────────────────────────────────────

STRUCTURE, TOP TO BOTTOM:

1. STACK HEADER CARD (white, rounded bottom corners, shadow):
   "Notifications" — standard stack title.

2. SEGMENTED CONTROL (20dp horizontal padding, 16dp top gap):
   Replaces the three SegmentChip bordered buttons.

   TRACK: radius.full pill, 48dp height, full card width.
     Background: #EBEBEC (neutral near-white, clearly a track, not a card)
     No border, no shadow on the track itself.

   INNER PILL: white, radius.full, inset 3dp from the track edges.
     Soft shadow (same as all surface cards — stacked 1-2dp shadow).
     Width = 1/3 of the track (for three equal options).
     Position: animated with withSpring on translateX. Spring physics:
     damping 18, stiffness 220, mass 0.9 — snappy, minimal overshoot.
     Haptic feedback (light) on tab change.

   LABELS: "All", "Unread", "Read" — centered over each third of track.
     Selected: Step 3, weight 600, color.ink.
     Unselected: Step 3, weight 400, color.inkSoft.
     Labels sit above the inner pill in the z-order (text always visible).

   No accent color anywhere in the control — the white elevated pill is
   the entire selection signal.

3. NOTIFICATION LIST (scrollable, 20dp horizontal padding, 16dp top gap):

   DATE SECTION (one group per calendar date):

   SECTION HEADER ROW:
   - Date label: "TODAY" / "YESTERDAY" / "18 JUN"
     Step 4 uppercase, letterspaced (0.5dp), color.inkSoft.
   - No right-side element needed on date headers for this screen.

   WHITE SHADOW CARD (radius.md, shadow — wraps all rows for this date):
   Each row separated by a hairline (color.line, full card width).

   NOTIFICATION ROW (inside the card):

   Left:
   - UNREAD DOT: 6dp filled circle, color.accent (#2B3FE0). Positioned
     to the left of the icon well, vertically centered. Visible only
     when unread=true. On mark-read: fades out and scales to 0 with a
     quick spring (withSpring damping 20, stiffness 260).
   - ICON WELL: 34×34dp, radius.sm (8dp).
     Background: 8% semantic tint (not full-color):
       transaction_auto:   #sky at 8% opacity
       budget_threshold:   #amber at 8% opacity
       capture_failed:     #danger at 8% opacity
     Icon: 16dp, full-strength semantic color, strokeWidth 2.
     When read: icon well drops to 50% overall opacity (keeps the
     semantic meaning but visually recedes).

   Center (flex: 1, gap 1dp):
   - Title: Step 3.
     Unread: weight 600, color.ink.
     Read: weight 400, color.inkSoft.
   - Body: Step 4, numberOfLines 2.
     Unread: color.inkSoft.
     Read: color.inkFaint.
   - Time: Step 4 (10sp), color.inkFaint. Always visible.

   Right (action wells, aligned center):
   - MARK READ well (shown only when unread=true):
     28dp circle, success 8% tint background, Check icon in color.success.
   - DELETE well (always shown):
     28dp circle, danger 8% tint background, Trash2 icon in color.danger.
   The 8% tint on action wells is correct semantic usage — small,
   functional, communicates action meaning without large color fills.

   Row press state: opacity 0.88, spring scale 0.985.
   Tapping the main row body: marks as read + fires navigation action.

4. EMPTY STATES (Lottie EmptyState component):
   All three filter states have distinct Lottie variants:
   - Inbox empty (no notifications at all):
     Title: "All clear"
     Subtitle: "Nothing to catch up on."
   - Filter empty (Unread tab, none unread):
     Title: "You're all caught up"
     Subtitle: "No unread notifications."
   - Filter empty (Read tab, none read):
     Title: "Nothing read yet"
     Subtitle: "Notifications appear here once dismissed."

NOTIFICATION KINDS AND THEIR SEMANTIC COLORS:
  transaction_auto: ScanLine icon — sky/info (blue)
    "₹4 added · akshaykrishna0106@okicici · Other · 2:08 PM"
  budget_threshold: AlertTriangle icon — warning (amber)
    "Budget alert · 80% of your monthly budget used"
  capture_failed: AlertTriangle icon — danger (red)
    "SMS capture failed · We couldn't read this bank message."

INTERACTION NOTES:
- Tapping a row: marks as read + fires the notification's action:
  → "home": navigation.goBack()
  → "manual_add": navigate to ManualAddTransaction
  → "transaction_detail": navigate to TransactionDetail (existing cache
    lookup behavior — keep unchanged)
  → "none": no navigation, only mark read
- Tapping ✓ well: marks that single notification as read (dot disappears
  with spring fade, icon well dims, text shifts to read weight/color).
- Tapping 🗑 well: deletes the notification (row animates out — slide
  + fade, spring physics).
- Switching filter tabs: inner pill slides with spring to new position,
  list cross-fades to filtered content.

CRITICAL RULES FOR THIS SCREEN:
- Segmented control has NO accent color. White pill on neutral track only.
- Icon wells: 8% semantic tint only — never full-color fills.
- Action wells (✓/🗑): also 8% tint — these are the only two places
  where success green and danger red appear as background fills, and at
  8% they are within the "small use" allowance for semantic colors.
- Unread dot: accent (#2B3FE0), 6dp, left of icon well. Read rows have
  no dot — the absence of the dot is the "read" signal.
- Row card container: white shadow card per date section, hairline
  separators. Same pattern as Category Transactions and Transaction List.
- Section headers: Step 4 uppercase color.inkSoft. Never bolder than
  other section headers across the app.
- Empty states: Lottie EmptyState. No TwoToneEmptyState.
```

---

## 12. MANUAL ADD TRANSACTION SCREEN

**Source files:**

- `frontend/src/screens/transactions/ManualAddTransactionScreen.tsx`
- `frontend/src/features/transactions/components/bento/ManualAddTransactionEditor.tsx`
- `frontend/src/features/transactions/components/bento/ManualAddAmountSection.tsx`
- `frontend/src/features/transactions/components/bento/ManualAddCategorySection.tsx`
- `frontend/src/features/transactions/components/bento/ManualAddDateField.tsx`
- `frontend/src/features/transactions/counterpartyTypes.ts`
- `frontend/src/components/categories/CategoryPill.tsx`

```
WHAT THIS SCREEN IS:
A modal-style stack screen for manually logging a transaction. It has a
"← Add transaction" header and a scrollable form below. The user fills in
amount, category, who they paid/received from, an optional note, and a
date/time that defaults to now.

PROBLEMS WITH THE CURRENT DESIGN:
1. WRONG FIELD ORDER — Current: Amount → Type dropdown → Name → Category
   → Note → Date. Natural mental model: "I spent ₹240 on food at Swiggy."
   = Amount → Category → Who. Category should come before counterparty.

2. SELECT DROPDOWN — "Counterparty type" is a native-feel dropdown with a
   chevron. 4 options (Shop or business / Person / Self transfer / Unknown).
   This is the only dropdown in the app. Replace entirely with inline chips.

3. UNDERSIZED AMOUNT HERO — The most important field on the screen (amount)
   is a 24sp text input inside a small bordered rectangle. It has less visual
   weight than the section labels. It should be the Step 1 hero.

4. TWOTONECARD CONTAINER — The entire form is wrapped in a TwoToneCard
   (pastel header + white body). Replace with separate white shadow cards per
   section, matching every other form screen we have redesigned.

5. DATE/TIME AFFORDANCE CONFUSION — The date and time fields look like text
   inputs with a ChevronRight icon inside them. ChevronRight signals
   navigation, not a picker. Fix with ghost pill buttons + Calendar/Clock
   Lucide icons.

──────────────────────────────────────────────────────────────────────────
NEW FIELD ORDER (top to bottom):
  1. Amount + Expense/Income toggle     ← hero — always first
  2. Category chip grid                 ← what kind of spend
  3. Counterparty type chips + name     ← who / where (combined section)
  4. Note                               ← optional context
  5. Date & Time row                    ← defaults to now, rarely changed
  6. Footer: Clear + Save
──────────────────────────────────────────────────────────────────────────

1. AMOUNT CARD (white shadow card, radius.lg):

   "AMOUNT" — Step 4 uppercase, color.inkSoft, letterSpacing 0.6

   Centered amount display:
     ₹   [   0   ]
   - "₹" currency prefix: Step 3 (16sp), color.inkSoft, vertically
     centered alongside the input.
   - Amount value: Step 1 (42sp), tabular mono, no bordered box, no
     background fill. The cursor alone signals focus.
   - Placeholder: "0" at muted neutral — large but clearly a placeholder.
   - When amount > 0 AND Expense selected: text color shifts to accent
     (#2B3FE0).
   - When amount > 0 AND Income selected: text color shifts to success
     (#1DB07A or equivalent semantic green).
   - Keyboard: decimal-pad.

   EXPENSE / INCOME SLIDING PILL CONTROL (directly below amount, 12dp gap):
   - Track: neutral surface (#EBEBEC), radius.full, full-width.
   - Inner white pill slides with spring animation (mass 0.6, damping 22,
     stiffness 300) to the selected option.
   - "Expense" selected: accent (#2B3FE0) label text on white pill.
   - "Income" selected: success green label text on white pill.
   - Semantic color on this toggle is intentional — it communicates
     financial direction, not decoration. This is the one place where
     two semantic colors (accent + success) coexist in one control,
     which is acceptable because the toggle DEFINES the type.
   - Label: Step 3, semibold (600), radius.full pill caps.

2. CATEGORY CARD (white shadow card, radius.md, 16dp padding):

   HEADER ROW:
   - Left: "CATEGORY" Step 4 uppercase, color.inkSoft
   - Right: "(optional)" Step 4, color.inkFaint

   CHIP GRID (flex-wrap, 8dp gap):
   - One chip per category (system + custom). Each chip: icon + label.
   - Chip: radius.full pill (or radius.sm — match CategoryPill existing
     shape), minHeight 36dp, paddingHorizontal 12dp.
   - Unselected: neutral border (color.line), color.inkSoft text,
     category icon at category.color (retain icon colors for recognition).
   - Selected: 8% accent tint background, accent border (1.5dp),
     color.ink text. Icon remains its own color.
   - No border change on the icon color — the tint bg + border is enough.

   "+ CUSTOM" ADD PILL (last in grid):
   - Dashed border (borderStyle: "dashed"), accent color.
   - Plus icon (Lucide) + "Custom" label, accent text.
   - Tap → navigate to CustomCategory create screen.

   Loading state: ActivityIndicator at center, same minHeight as one row.

3. COUNTERPARTY CARD (white shadow card, radius.md, 16dp padding):

   HEADER LABEL (switches based on Expense / Income toggle):
   - Expense selected → "PAID TO" (Step 4 uppercase, color.inkSoft)
   - Income selected  → "RECEIVED FROM" (Step 4 uppercase, color.inkSoft)

   TYPE CHIPS ROW (flex-wrap, 8dp gap, below header, 8dp gap):
   Four inline icon chips — replaces the SelectDropdown entirely:
     [🏪 Shop]   [👤 Person]   [↔ Transfer]   [? Unknown]
   Icons (Lucide): Store / User / ArrowLeftRight / HelpCircle
   - Chip: radius.full pill, minHeight 36dp, paddingHorizontal 12dp.
   - icon (16dp) + label (Step 4, 13sp), side by side, 6dp gap.
   - Unselected: neutral border, color.inkSoft text and icon.
   - Selected: 8% accent tint bg, accent border (1.5dp), color.ink text
     and icon.
   - Default selection: "Shop" (merchant) — most common.

   NAME TEXT INPUT (below type chips, 12dp gap):
   - Standard text input, radius.md, color.line border (1dp).
   - Focus: accent border (1.5dp), no background fill change.
   - Placeholder adapts to selected type:
       merchant     → "e.g. Swiggy, Amazon, BigBasket"
       person       → "e.g. Rahul, Mom, Arjun"
       self_transfer → "e.g. ICICI to HDFC savings"
       unknown      → "What was this for?"
   - No label above the input — the type chips section header ("PAID TO /
     RECEIVED FROM") and the placeholder text together provide enough
     context. Keep it minimal.

4. NOTE CARD (white shadow card, radius.md, 16dp padding):

   HEADER ROW:
   - Left: "NOTE" Step 4 uppercase, color.inkSoft
   - Right: "(optional)" Step 4, color.inkFaint

   Single-line text input (no label above it, header covers it):
   - Placeholder: "Add a short note"
   - Same input styling as counterparty name field.

5. DATE & TIME ROW (no card — sits directly on #FAFAFA background,
   horizontal padding 20dp, gap 12dp between the two buttons):

   Two equal-width ghost pill buttons side by side:

   LEFT — Date button:
     [📅 Calendar icon (16dp, color.inkSoft)]  Jun 20, 2026
     Step 3, color.ink, radius.full, border color.line (1dp)
     minHeight 44dp

   RIGHT — Time button:
     [🕐 Clock icon (16dp, color.inkSoft)]  9:54 PM
     Step 3, color.ink, radius.full, border color.line (1dp)
     minHeight 44dp

   Press state for both: spring scale 0.96 + opacity 0.85.
   Tap → open native DateTimePicker (existing behavior, keep as-is).
   iOS inline picker: render below the tapped button when active
   (existing iosPickerMode pattern — keep the mechanism, just restyle
   the trigger button).

6. FOOTER (below date row, horizontal padding 20dp, safe area bottom):

   Two buttons side by side (same proportions as all other screen footers):
   - LEFT: "Clear" — ghost neutral button, radius.full, color.inkSoft text.
     Tap: resets all fields to initial state (existing onClear behavior).
   - RIGHT: "Save" — accent filled button, radius.full, white text,
     color.accent bg (#2B3FE0).
     Disabled state (when amount = 0): 40% opacity, non-interactive.
     Loading state (saveLoading): show ActivityIndicator inside the button,
     label hidden.

──────────────────────────────────────────────────────────────────────────
CRITICAL RULES FOR THIS SCREEN:

- Remove TwoToneCard entirely. Each section is an independent white shadow
  card on the #FAFAFA page background.
- Remove SelectDropdown entirely. Counterparty type is 4 inline chips.
- The amount input has NO bordered box. The large 42sp number with cursor
  IS the affordance. borderWidth: 0 on the TextInput wrapper.
- Semantic colors on the Expense/Income toggle are intentional and allowed.
  They communicate financial direction. Do not neutralize them.
- "PAID TO" / "RECEIVED FROM" label must reactively update when the
  Expense/Income toggle changes. This is a dynamic label — wire it.
- Counterparty name placeholder must reactively update when type chip
  changes. Keep it a single TextInput with a dynamic placeholder prop.
- Category icon colors are RETAINED for recognition (users know the green
  leaf for Nature, red flame for Food, etc.) even in monochrome mode.
  Only backgrounds and borders follow the monochrome rules.
- Date and Time triggers use ghost pill buttons, NOT text-input-style
  bordered boxes. ChevronRight icon must be removed from these triggers.
- "Save" button disabled at amount = 0. Do not disable based on
  counterparty name or category — both are genuinely optional.
- Card spacing: 16dp vertical gap between each section card. Page padding:
  16dp top, 24dp bottom (above safe area).
```

---

## 13. DIME AGENT CHAT OVERLAY

**Source files:**

- `frontend/src/features/agent/components/AgentChatOverlay.tsx`
- `frontend/src/features/agent/components/AgentMessageRenderer.tsx`
- `frontend/src/features/agent/components/AgentThinkingBubble.tsx`
- `frontend/src/features/agent/components/AgentMessageProse.tsx`
- `frontend/src/features/agent/constants/suggestedPrompts.ts`

```
WHAT THIS IS:
A floating FAB button that morphs into a chat panel overlay using Reanimated
scaleX/scaleY independent transforms anchored to the bottom-right corner.
The morph animation, keyboard-avoidance behavior, and panel dimensions are
already sophisticated — preserve them entirely. Only visual styling changes.

PROBLEMS WITH THE CURRENT DESIGN:
1. GRADIENT BORDER — The FAB and panel both use `borderColor: colors.
   headerGradientEnd` at borderWidth 3. This is the dominant "old design"
   element. The monochrome system uses shadows for elevation, never colored
   borders.
2. GRADIENT COLOR TOKENS — `colors.headerGradientStart` and `colors.
   headerGradientEnd` appear 7 times across the overlay and message renderer.
   Every single one maps to `colors.accent` (#2B3FE0).
3. SUGGESTION ROWS — Full-width bordered white rectangles with plain text.
   Zero visual hierarchy; look like an HTML list.
4. COMPOSER INPUT — Bordered radius.lg rectangle input looks like a web
   form field. Not native-feeling.
5. TWOTONECARD IN MetricBlock — Replace with white shadow card.

──────────────────────────────────────────────────────────────────────────

1. FAB BUTTON:

   OLD: white bg, borderWidth 3, borderColor headerGradientEnd,
        Sparkles icon in headerGradientStart, shadowColor headerGradientStart.

   NEW:
   - backgroundColor: colors.accent (#2B3FE0)
   - No border (borderWidth: 0)
   - Sparkles icon: white (#FFFFFF), size 20, strokeWidth 2
   - Shadow: neutral black — shadowColor #000, shadowOffset {0, 6},
     shadowOpacity 0.18, shadowRadius 12, elevation 10
   - Press state: spring scale 0.94 + opacity 0.9 (existing fabPressed,
     keep behavior)

   RATIONALE: The agent FAB is the signature entry point of the product's
   AI feature. A solid accent circle FAB — white icon on indigo — immediately
   communicates "AI is always available" without any explanation. This is
   consistent with how every major AI product (ChatGPT, Gemini, Claude)
   surfaces their chat entry point. One solid accent circle is within the
   monochrome "single accent" rule.

2. PANEL FRAME:

   OLD: borderWidth 3, borderColor headerGradientEnd,
        shadowColor headerGradientStart (colored shadow).

   NEW:
   - borderWidth: 0 (remove entirely)
   - backgroundColor: #FFFFFF (keep — already correct)
   - Shadow: neutral — shadowColor #000, shadowOffset {0, 12},
     shadowOpacity 0.12, shadowRadius 24, elevation 16
   - borderRadius interpolation: keep exactly as-is (collapsedCorner →
     radius.lg → radius.xl during expand morph)

   MORPH BACKGROUND TRANSITION (optional but highly recommended):
   Interpolate the panel's backgroundColor over the first 30% of progress:
     progress 0.0 → backgroundColor: colors.accent (#2B3FE0)
     progress 0.3 → backgroundColor: #FFFFFF
     progress 1.0 → backgroundColor: #FFFFFF
   The panel literally materializes out of the accent FAB dot. This adds
   one moment of brand magic to the already-good morph animation, and
   reinforces that the accent FAB and the white panel are the same element.
   Use interpolateColor from Reanimated for this.

3. HEADER:

   - Sparkles icon: colors.accent (#2B3FE0) — token update only
   - "Dime Agent" title: keep size (18sp) and weight (semibold), update
     color to colors.ink (color.textPrimary equivalent)
   - [↺ RotateCcw] and [✕ X] icon buttons: color.inkSoft — token update
   - REMOVE borderBottomWidth hairline divider — replace with paddingBottom
     increase to 14dp. In a white panel, a 1dp hairline reads as visual
     noise and contradicts the no-borders principle.

4. SUGGESTIONS SECTION ("SuggestionsHeader"):

   TITLE:
   - Old: "Ask about your money" — 15sp, fontFamilies.medium, textSecondary
   - New: "TRY ASKING" — Step 4 uppercase (11sp), letterSpacing 0.6,
     color.inkSoft, marginBottom 10dp
   The placeholder "Ask a question…" in the composer already handles the
   "what to do here" UX. The title should label the list, not explain it.

   SUGGESTION ROWS (replace bordered rectangles entirely):
   Each row layout:
   ┌─────────────────────────────────────────────────────┐
   │  [icon well]  Prompt text                   [↗ icon]│
   └─────────────────────────────────────────────────────┘

   ICON WELL:
   - 32×32dp, radius.sm
   - backgroundColor: #2B3FE0 at 8% opacity (rgba(43, 63, 224, 0.08))
   - Lucide icon: 16dp, colors.accent, strokeWidth 1.5
   - Icons per prompt (see mapping below)

   PROMPT TEXT:
   - Step 3 (15sp), fontWeight 500, color.ink
   - flex: 1 to fill available space

   ARROW ICON:
   - ArrowUpRight, 14dp, color.inkFaint (signals "send this")
   - alignSelf: center

   ROW CONTAINER:
   - No border, no background fill
   - minHeight: 44dp (touch target)
   - paddingVertical: 6dp, paddingHorizontal: 4dp
   - flexDirection: row, alignItems: center, gap: 12dp
   - Press state: backgroundColor #F4F4F5, spring scale 0.985, duration 120ms

   VERTICAL SPACING:
   - gap: 2dp between rows (tight — icon wells create enough separation)

   ICON MAPPING (update AGENT_SUGGESTED_PROMPTS or add a parallel metadata
   array — do NOT change the prompt text strings themselves, they are sent
   to the API as-is):
     "How much did I spend this month?"        → TrendingDown
     "Am I over my monthly budget?"             → Target
     "Top spending categories this month"       → LayoutGrid
     "Compare this month vs last month"         → ArrowLeftRight
     "Show my daily spending last 40 days"      → BarChart2
     "Where did I spend the most last month?"   → Store
     "How much did I spend on food this month?" → UtensilsCrossed
     "Compare this year vs last year"           → CalendarRange

   Implementation: add a `AGENT_SUGGESTED_PROMPT_META` array of
   `{ prompt: string; icon: LucideIcon }` objects alongside the existing
   prompts constant, and update SuggestionsHeader to consume it.

5. COMPOSER BAR:

   TEXT INPUT:
   - Old: borderWidth 1, borderColor cardBorder, radius.lg, bg pageBackground
   - New: borderWidth 0, radius.full (pill), backgroundColor #F4F4F5
     (neutral surface), paddingHorizontal 16dp, paddingVertical 10dp
   - No border at all — the neutral fill surface is the affordance

   SEND BUTTON:
   - backgroundColor: colors.accent (#2B3FE0) — token update from
     headerGradientStart
   - No other changes

   COMPOSER CONTAINER:
   - Remove borderTopWidth hairline
   - backgroundColor: #FFFFFF (matches panel interior)
   - paddingTop: 8dp (was spacing.md — just use a smaller gap)

6. MESSAGE BUBBLES (AgentMessageRenderer):

   USER BUBBLE (bubbleUser):
   - backgroundColor: colors.accent (#2B3FE0) — token update from
     headerGradientStart. White text. Keep.
   - This is intentional and NOT a monochrome violation. The user bubble
     needing to be visually distinct from the assistant bubble is a chat UX
     fundamental. Accent fill for own messages is the universal standard
     (iMessage, WhatsApp, Telegram, ChatGPT). One accent fill in a contained
     chat surface is within the "single accent" allowance.

   ASSISTANT BUBBLE (bubbleAssistant):
   - Remove borderWidth 1 / cardBorder
   - Add subtle shadow: shadowColor #000, shadowOffset {0,1},
     shadowOpacity 0.06, shadowRadius 4, elevation 2
   - backgroundColor: #FFFFFF (keep)

   DEEP LINK TEXT (deepLinkText):
   - color: colors.accent — token update from headerGradientStart

   METRIC BLOCK (MetricBlock):
   - Replace TwoToneCard with a plain white shadow card:
     backgroundColor #FFFFFF, radius.md, soft shadow (elevation 2),
     paddingHorizontal 12dp, paddingVertical 10dp.
   - No pastel header. Render BentoStatCell label + value + delta directly
     in a single padded white container.

7. THINKING BUBBLE (AgentThinkingBubble):
   - If it uses headerGradientStart/End anywhere, update to accent token.
   - Keep animation behavior unchanged.

──────────────────────────────────────────────────────────────────────────

CRITICAL RULES FOR THIS OVERLAY:

- Morph animation: DO NOT change scaleX/scaleY/transformOrigin/anchorBottom
  logic. Only backgroundColor and border styling change.
- FAB accent fill is explicitly allowed here. This is the product's AI entry
  point — one solid accent FAB is the correct application of the accent rule.
- User message bubble accent fill is explicitly allowed. Chat UX requires
  clear sender distinction; accent fill is the correct choice.
- Remove ALL references to colors.headerGradientStart and
  colors.headerGradientEnd throughout all agent component files.
  Replace every instance with colors.accent.
- Suggestion row prompt text strings must NOT be changed — they are sent
  verbatim to the backend API as query text.
- Add AGENT_SUGGESTED_PROMPT_META alongside the existing prompts const
  rather than mutating the string array, so the API call path is unaffected.
- borderTopWidth on composer and borderBottomWidth on header: both removed.
  Use padding/spacing for visual breathing room instead.
```

---

## 14. UNIVERSAL TRANSITIONS, STACK HEADER & SKELETON SYSTEM

**Source files:**

- `frontend/src/navigation/MainStackNavigator.tsx`
- `frontend/src/navigation/RootNavigator.tsx`
- `frontend/src/navigation/stackScreenOptions.ts`
- `frontend/src/components/layout/StackBrandedHeader.tsx`
- `frontend/src/components/layout/HeaderGradientFill.tsx`
- `frontend/src/components/ui/SkeletonBlock.tsx`
- `frontend/src/components/ui/SkeletonStrip.tsx`
- `frontend/src/components/ui/skeletonStripPresets.ts`
- `frontend/src/constants/motion.ts`
- `frontend/src/constants/colors.ts`

```
──────────────────────────────────────────────────────────────────────────
A. STACK SCREEN HEADER (StackBrandedHeader) — CRITICAL

This is the most impactful single change outside of individual screens.
Every stack-pushed screen (Settings, Notifications, ManualAdd,
TransactionsList, InsightsMonthCompare, CustomCategory, EditBudget, etc.)
uses StackBrandedHeader, which currently renders HeaderGradientFill — the
same purple gradient curtain as the home screen header. This violates the
monochrome system on every non-tab screen in the app.

CURRENT:
  - Background: HeaderGradientFill (linear gradient, purple → indigo)
  - Rounded bottom corners: spacing.headerCurveRadius (large asymmetric curve)
  - Title: typography.headerUsernameLine (white text, on gradient)
  - Back button: tintColor colors.textOnPrimary (white arrow, on gradient)

NEW:
  - Background: color.surface (#FFFFFF) — plain white card surface
  - No gradient, no HeaderGradientFill — delete or bypass the component
  - Bottom corners: radius.md (20dp) — same as standard cards. The header
    reads as "the first card on the page," not a special banner.
  - Shadow: shadow.card + shadow.cardAmbient (same as all cards) —
    the header floats above the #FAFAFA page with a soft shadow, no border
  - Title: font.h3 (16sp / 600), color.ink — left-aligned, flex: 1
  - Back button: ChevronLeft or ArrowLeft icon (Lucide), 24dp, color.ink
    No filled circle background. Ghost press state (opacity 0.6).
    hitSlop: 12 on all sides.
  - Right-side icons (if any): color.inkSoft, 20dp, same ghost press state
  - Header height: insets.top + 52dp (same as before — only visual changes)
  - No separator line between header and page content. The shadow is enough.

IMPLEMENTATION NOTE:
  Replace the gradient implementation inside StackBrandedHeader — remove
  HeaderGradientFill entirely and replace with a plain View with
  backgroundColor: color.surface and the shadow tokens. The curved bottom
  corners change from the large asymmetric curve to radius.md on both
  bottom corners only (borderBottomLeftRadius + borderBottomRightRadius).

──────────────────────────────────────────────────────────────────────────
B. SCREEN TRANSITION ANIMATIONS

CURRENT STATE:
  - RootNavigator: animation: "fade" — for auth → main transitions. Keep.
  - MainStackNavigator: no explicit animation option set → falls back to
    platform default, which is slide_from_right on Android native stack.
    This is fine for push, but should be explicitly set for clarity.

SPECIFICATION:

  1. STACK PUSH / POP (all MainStack screens):
     animation: "slide_from_right"
     Set explicitly in MainStackNavigator screenOptions. Do NOT use
     "ios_from_right" — we are Android-only (confirmed in design-system.md).
     The native slide is the correct choice: it's familiar, fast, and
     communicates spatial hierarchy (you went deeper / you came back).
     Do NOT use "fade" for push — fade removes directionality and makes
     the app feel flat rather than spatially navigable.

  2. MODAL-STYLE STACK SCREENS (bottom-sheet feel):
     The following screens should feel like they slide up from below, not
     from the right — they are "actions on top of context," not "navigation
     deeper":
       - ManualAddTransaction
       - EditMonthlyBudget
       - CreateCustomCategory / EditCategory
     Use: animation: "slide_from_bottom" for these screens only.
     These are the same screens that feel like modal sheets to the user.
     Slide-from-bottom reinforces that mental model.

  3. ROOT NAVIGATOR (auth → main):
     Keep animation: "fade" as-is. Auth to main is a session state change,
     not a spatial navigation — fade is correct here.

  4. GESTURE BACK (swipe-to-go-back):
     gestureEnabled: true for all stack screens.
     gestureEnabled: false only for ProfileSetup and PermissionsSetup
     (already set — keep).

  5. TRANSITION TIMING:
     React Navigation native stack uses the system animation duration by
     default (~250ms). Do not override with custom timing — the system
     animations are hardware-accelerated and frame-perfect. Only override
     if a screen's custom header (StackBrandedHeader) creates a visual
     flash — in that case, add a brief opacity transition on the header only
     (100ms fade-in), not on the whole screen.

──────────────────────────────────────────────────────────────────────────
C. SKELETON LOADING SYSTEM

CURRENT PROBLEMS:
  1. skeleton.surface = "rgba(99, 85, 232, 0.12)" — purple/violet tint.
     Skeleton blocks on a white card currently pulse with a purple tint.
     This is the most "accidental purple" surface left in the system.
  2. skeletonPulse.opacityMin: 0.55 — the shimmer swings from 55% to 100%
     opacity. With a neutral gray fill (new), this creates a subtle but
     readable pulse without being harsh.
  3. SkeletonBlock uses radius.sm for all strips — in the new scale,
     radius.sm = 16dp (quite round). Skeleton strips should use a smaller
     radius (4–6dp) for a more bar-like, data-placeholder feel.

NEW SKELETON COLOR TOKENS (update in colors.ts):
  skeleton.surface   = "#EAEAEC"  // = color.line — neutral cool gray,
                                  // reads as an empty data placeholder,
                                  // no brand tint whatsoever
  skeleton.onSurface = "#D4D4D8"  // slightly darker — for skeletons that
                                  // sit inside a white card (most cases)
  skeleton.onPrimary = "rgba(255, 255, 255, 0.28)"  // keep for any
                                  // surface that is still accent-colored
                                  // (e.g. user message bubble in agent chat)

SKELETON PULSE PARAMETERS (update in motion.ts):
  skeletonPulse = {
    durationMs:   800,     // slightly slower — calm, not frantic
    opacityMin:   0.45,    // slightly lower floor — more contrast in pulse
    opacityMax:   1.0,     // full opacity at peak (unchanged)
  }
  The net effect: the shimmer is a gentle, slow wave that communicates
  "loading" without demanding attention. The opacity trough goes lower
  (0.45 vs 0.55) to keep the pulse visible against the new neutral gray.

SKELETON STRIP RADIUS (update in SkeletonBlock / skeletonStripPresets):
  All strip presets: borderRadius: 4 (hardcoded, not from radius scale)
  Reason: skeleton strips are data-shape placeholders. A 16dp radius would
  make them look like buttons. 4dp gives a rectangular bar with just
  slightly rounded corners — reads as "I am the shape of a piece of text."

STRIP PRESETS — NO CHANGES TO SIZES:
  The existing size presets (amountHero, statValue, subtext, listTitle,
  listMeta, listAmount) accurately represent the content shapes under the
  new typography scale. Widths and heights are fine as-is. Only radius and
  color change.

SKELETON TONE MAPPING (which tone to use where):
  - Inside a white card (color.surface): use tone="onSurface" →
    skeleton.onSurface (#D4D4D8)
  - On the page background (color.paper, #FAFAFA): use tone="surface" →
    skeleton.surface (#EAEAEC)
  - Inside any accent-fill surface: use tone="onPrimary" →
    rgba(255,255,255,0.28) — rare, only agent chat user bubble

──────────────────────────────────────────────────────────────────────────
D. FAB BREATHE ANIMATION — REMOVE

motion.ts currently defines fabBreathe: { scaleMin: 1, scaleMax: 1.04,
halfCycleMs: 1400 }. The design-system.md explicitly removes the FAB
idle pulse ("A breathing animation on a button competes with the restraint
of the new system. The FAB stays still until touched.").

ACTION: Remove the fabBreathe constant from motion.ts and remove any
useEffect / withRepeat loop that reads from it in the FAB component.
The FAB simply sits at scale 1.0 at rest. Press state only.

──────────────────────────────────────────────────────────────────────────
CRITICAL RULES FOR THIS SECTION:

- StackBrandedHeader is used by ALL stack screens. Fixing it once fixes
  every screen simultaneously. This is the single highest-leverage change
  in the entire redesign — do it first.
- HeaderGradientFill should be removed/deprecated after this change. No
  screen should use it.
- slide_from_right for push and slide_from_bottom for modal-feel screens.
  No fade on spatial navigation.
- skeleton.surface must be a neutral gray — no purple tint, ever. The
  purple tint was the single most jarring "old design" artifact visible
  during loading states.
- borderRadius: 4 for all skeleton strips — not from the radius scale.
- fabBreathe is fully removed. No idle animation on any button.
```

---

## 15. APP HEADER + TAB BAR (Navigation Chrome)

**Source files:**

- `frontend/src/components/layout/AppHeader.tsx`
- `frontend/src/components/layout/HeaderGradientFill.tsx` ← DELETE this file
- `frontend/src/components/navigation/DimeTabBar.tsx`
- `frontend/src/components/navigation/DimeTabBarItem.tsx`
- `frontend/src/components/navigation/dimeTabBarConfig.ts`
- `frontend/src/constants/motion.ts` ← fabBreathe removal (see Section 14)

```
MONOCHROME PRINCIPLE APPLIED HERE:
Elevation defines surfaces, not color. Every card in the app is white on
#FAFAFA, separated by shadow — not colored fills. The navigation chrome
follows the exact same rule. The tab bar is currently the largest single
colored surface in the entire app (solid purple fill). That changes here.

──────────────────────────────────────────────────────────────────────────
A. APP HEADER (AppHeader.tsx)

CURRENT:
  - Background: HeaderGradientFill (SVG linear gradient, purple → lighter
    purple, headerGradientStart → headerGradientEnd)
  - Bottom corners: spacing.headerCurveRadius (large asymmetric curve)
  - Avatar: 2dp colored ring (headerAvatarRingBorder), hero.avatarRing bg
  - Greeting + name: white text on gradient
  - Settings / Bell: 36dp filled circles (headerBellCircleBg), white icons
  - Unread dot: colors.primary (purple)

NEW:

  SURFACE:
  - backgroundColor: color.surface (#FFFFFF)
  - borderBottomLeftRadius + borderBottomRightRadius: radius.lg (28dp)
  - Shadow: shadow.card + shadow.cardAmbient — same as every other card
  - Remove HeaderGradientFill entirely (delete the import and the component)
  - HeaderGradientFill.tsx: DELETE this file. Nothing should reference it
    after this change. Search the codebase for any remaining imports and
    remove them.

  AVATAR (40dp circle):
  - Remove borderWidth / borderColor (headerAvatarRingBorder — gradient token)
  - Remove backgroundColor (hero.avatarRing — gradient token)
  - Add shadow.card to the avatar View (a small shadow gives edge definition
    against the white header without any color)
  - Fallback background (when no image / loading): color.surfaceSunken
    (#F1F1F3)
  - Avatar loading skeleton: use SkeletonBlock with tone="onSurface" instead
    of the current overlays.avatarSkeleton (gradient-themed token)

  GREETING + NAME:
  - Greeting ("Good morning / afternoon / evening"):
    font.caption (11.5sp / 450 / color.inkSoft) — Step 4
  - Display name:
    font.h2 (19sp / 600 / color.ink) — Step 2
  - Name loading skeleton: SkeletonStrip variants with tone="onSurface"
    (replaces the current nameLineShort / nameLineLong inline skeleton views)

  SETTINGS + BELL ICON BUTTONS:
  - Remove the permanently-visible 36dp filled circle backgrounds
    (headerBellCircleBg). On gradient they were needed for legibility. On
    white they're visual noise.
  - New: ghost icon buttons — no background fill at rest.
    Icon: color.inkSoft (#5B5D68), size 20dp, strokeWidth 1.5
    hitSlop: 10 on all sides
    Press state: a 32dp color.surfaceSunken (#F1F1F3) circle background
    appears only on press (Pressable style callback), spring scale 0.94
  - Gap between Settings and Bell: spacing.sm (keep)

  UNREAD NOTIFICATION DOT:
  - Change from colors.primary (purple brand token) to color.danger (#D6394A)
  - An unread notification is an alert, not a brand moment.
  - Size: 7dp (was UNREAD_BADGE_SIZE = 8dp — slight reduction looks cleaner)
  - Position: top: 3, right: 3 (same general location)
  - The danger dot is the ONLY colored element in the entire AppHeader.

  PROFILE FETCH ERROR TEXT:
  - Update to use color.inkSoft / font.caption tokens (no functional change)

──────────────────────────────────────────────────────────────────────────
B. DIME TAB BAR (DimeTabBar.tsx)

CURRENT:
  - Bar background: colors.headerGradientStart (solid purple)
  - Top border: borderTopWidth 1, colors.onPrimaryHairline (white hairline)
  - Floating active orb: white bg, 3dp headerGradientEnd border,
    headerGradientStart colored shadow
  - Notch cutout: pageBackground-colored circle behind the orb
  - Liquid pill: transparent (invisible, drives morph transform only)
  - Active icon (in orb): colors.headerGradientStart (purple on white orb)
  - Inactive icons: colors.tabBarOnPrimaryInactive (white semi-transparent)
  - Center FAB: white bg, 3dp headerGradientEnd border, Plus icon in
    headerGradientStart, headerGradientStart colored shadow
  - Action bubbles: white bg, 3dp headerGradientEnd border, icons in
    headerGradientStart
  - FAB breathe: withRepeat scale pulse — REMOVE (already spec'd in §14)

NEW:

  BAR SURFACE:
  - backgroundColor: color.surface (#FFFFFF)
  - borderTopWidth: 0 — REMOVE the top border entirely
  - Top-direction shadow (the bar floats above page content, shadow goes UP):
    shadowColor: #000, shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 8
  - borderTopLeftRadius + borderTopRightRadius: radius.lg (keep — great
    design touch, the bar reads as a floating card, not a system chrome bar)
  - overflow: "visible" (keep — needed for the floating orb to extend above)

  FLOATING ORB (active tab indicator):
  - backgroundColor: color.surface (#FFFFFF) — white. No accentSoft tint.
  - borderWidth: 0 — REMOVE the 3dp colored border entirely
  - Shadow (neutral, not colored):
    shadowColor: #000, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10, shadowRadius: 8, elevation: 10
  - The orb is visible PURELY through its shadow elevation against the flat
    white bar. This is "elevation defines surfaces" applied perfectly — a
    white disc that lifts off the surface by casting a shadow, not by color.
  - Dimensions, position (top: -21), and all transform logic: UNCHANGED
  - The scaleX/scaleY liquid morph and -translateY lift animations during
    tab travel are all kept exactly as-is. Only visual styling changes.

  ACTIVE ICON (inside the orb):
  - color.ink (#14151A) — full ink, NOT accent, NOT headerGradientStart
  - The visual hierarchy is: orb elevation (floating) + full-ink icon
    (vs faint icon on the bar) = two distinct signals with zero color

  NOTCH CUTOUT:
  - REMOVE entirely. The notch was a pageBackground-colored circle punched
    into the colored bar to create an "embedded orb" illusion. On a white
    bar (#FFFFFF) vs page background (#FAFAFA), the 5-unit brightness
    difference is imperceptible and reads as a rendering artifact.
  - Remove the notchCutout animated view and its style. Remove the
    notchCutoutStyle useAnimatedStyle. Remove NOTCH_CUTOUT_SIZE from config.

  INACTIVE TAB ICONS:
  - color.inkFaint (#A0A2AD) — clear, readable on white
  - (Was: colors.tabBarOnPrimaryInactive — white/semi-transparent for
    visibility on purple bar)
  - The full active/inactive contrast range:
      Active:   color.ink (#14151A) inside elevated white orb
      Inactive: color.inkFaint (#A0A2AD) flat on white bar
    Strong, clean hierarchy. No color required.

  LIQUID PILL (travel morph):
  - At rest: backgroundColor transparent (invisible — keep as-is)
  - During travel: backgroundColor color.surfaceSunken (#F1F1F3)
    at 70% opacity — interpolate via travelMorph.value:
    opacity: interpolate(travelMorph.value, [0, 1], [0, 0.7])
  - This makes the travel animation actually visible for the first time
    (currently the pill exists in code but is always transparent). A soft
    neutral-gray pill stretches and snaps — pure motion, no color.
  - All transform logic (scaleX / scaleY / translateX): UNCHANGED

  CENTER FAB (+ button):
  - backgroundColor: color.ink (#14151A) — DARK FILL, not accent, not white
  - borderWidth: 0 — REMOVE the 3dp colored border
  - Plus icon: white (#FFFFFF)
  - Shadow: neutral black, shadowOffset { 0, 6 }, shadowOpacity 0.18,
    shadowRadius 12, elevation 12
  - No colored shadow (was headerGradientStart colored)
  - Press state: spring scale 0.94 + opacity 0.88

  WHY DARK FAB, NOT ACCENT:
  On a fully monochrome white bar, a dark ink circle is the strongest
  visual anchor. It creates hierarchy through WEIGHT (dark disc) rather than
  color. This is the signature design choice: N26, Revolut (launch era), and
  other monochrome fintech apps all use this pattern. The Plus icon in white
  on black has maximum legibility. The FAB becomes a graphic element —
  not a colored CTA, but a bold geometric anchor.

  RADIAL ACTION BUBBLES (Edit / Camera / Mic):
  - backgroundColor: color.surface (#FFFFFF)
  - borderWidth: 0 — REMOVE the 3dp colored borders
  - Icons: color.ink (#14151A) — consistent with the dark FAB they orbit
  - Shadow: shadow.card (neutral soft shadow)
  - All position/opacity/transform animations: UNCHANGED

  FAB BREATHE ANIMATION:
  - REMOVE entirely (also spec'd in Section 14)
  - Remove: fabBreatheScale useSharedValue, the useEffect that drives it,
    the centerFabBreatheStyle useAnimatedStyle, and the wrapping
    Animated.View around the center FAB
  - The FAB sits at scale 1.0 at rest. Only press state animates it.

──────────────────────────────────────────────────────────────────────────

COLOR TOKEN CLEANUP (after header + tab bar changes):

The following tokens become UNUSED after this section is implemented.
Remove them from colors.ts and any constants files to prevent future
confusion:

  colors.headerGradientStart      → replaced by color.ink / color.accent
  colors.headerGradientEnd        → replaced by color.ink / shadow
  colors.tabBarOnPrimaryInactive  → replaced by color.inkFaint
  colors.headerBellCircleBg       → removed (ghost buttons have no bg)
  colors.headerAvatarRingBorder   → removed (avatar uses shadow only)
  colors.onPrimaryHairline        → removed (tab bar top border gone)
  colors.textOnPrimary            → removed (no more white-on-gradient text)
  hero.avatarRing                 → removed (avatar uses surfaceSunken)
  hero.skeletonShort              → replaced by skeleton.onSurface
  hero.skeletonLong               → replaced by skeleton.onSurface

After removing: run `npx tsc --noEmit` and `npm run lint` in frontend/
to confirm no remaining references.

──────────────────────────────────────────────────────────────────────────

CRITICAL RULES FOR THIS SECTION:

- HeaderGradientFill.tsx must be DELETED, not just emptied. It is an SVG
  gradient component with no remaining use case after this change.
- The floating orb visibility relies entirely on its shadow. Do not reduce
  shadowOpacity below 0.10 — that is the floor for the orb to read as
  elevated against the white bar.
- The dark ink FAB (#14151A fill) is the monochrome signature choice.
  Do not substitute color.accent for the FAB here — the whole point is
  that the center action reads through weight, not color.
- Notch cutout: remove it cleanly. This means also removing NOTCH_CUTOUT_SIZE
  from dimeTabBarConfig.ts and the notchCutoutStyle animated view from
  DimeTabBar.tsx.
- The unread notification dot STAYS color.danger. An alert indicator that
  uses semantic color is not a monochrome violation.
- FAB breathe: ensure both the useEffect that drives the withRepeat AND the
  wrapping Animated.View (centerFabBreatheStyle) are removed. Just rendering
  the Pressable directly without the Animated.View wrapper is correct.
- After implementing: verify the liquid pill travel animation is now visible
  (color.surfaceSunken opacity interpolation). If it looks distracting,
  reduce opacity max to 0.5.
```

---

## 16. [NEXT SCREEN — TBD]

_Waiting on which screen to brainstorm next._
