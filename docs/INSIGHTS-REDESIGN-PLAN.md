# Insights redesign plan

Status: **draft for discussion** (2026-10-24). Nothing built yet.

## 1. Why

The owner's verdict on the current Insights tab, after the pace card (#47) and the forecast (#45, reverted) were removed:
"not really useful, too much text on screen, as a user I felt overwhelmed".

What the current screen does (top to bottom): month switcher, summary card (net, % saved, count, spent, income, budget
bar), fixed costs, daily cashflow chart, "Who you paid" donut, "Who paid you" donut, top expenses, compare launcher →
a second Compare screen.

Problems:

1. **It repeats Home.** Home's hero card and `MonthStatRow` already show spent / income / net / budget for the month.
2. **It describes, it doesn't explain.** Every card says *what*; none says *so what* (is this normal? what changed?).
3. **The main question has no direct answer.** "Where did my money go?" is answered by category first. Insights has a
   payee donut but no category view (categories only appear as "Top categories" on Home).
4. **Low-signal cards.** "Who paid you" is usually one salary (a 100 % donut); the per-day bars are noisy; top expenses
   have no context.
5. **Text everywhere.** Every card has a subtitle sentence ("Debit spending by payee this month · Excludes recurring
   costs"); the summary has a sentence too.
6. **No sense of time.** One month at a time; trends live behind a separate Compare screen.
7. **Thin data.** Most accounts have few entries; charts built for a full month look broken with 6 rows.

## 2. Principles (the acceptance bar)

1. **One question per screen:** *Where did my money go, and is that normal?*
2. **Understood in 3 seconds without reading.** Visuals and numbers first; no sentences on the screen.
3. **Detail only on tap.** The screen is the top layer; payees, transactions and explanations live in a sheet.
4. **Three blocks at most**, about 1.5 phone screens, no long scroll.
5. **Hide what isn't notable.** A block with nothing meaningful to say does not render.
6. **Facts, never predictions.** No forecast, pace, "safe to spend" or chance-of-budget (the owner removed these).
7. **Honest with little data.** The screen degrades by data level instead of drawing empty charts.

Copy rules: section titles are 1–2 words; no subtitles; amounts compact (`₹18.6k`, full value in the sheet and in
accessibility labels); one optional "?" per block opens a one-line explanation in a tooltip, never inline.

## 3. Division of labour between tabs

| Question | Lives on |
|---|---|
| Am I okay this month? (spent vs budget, income, net) | **Home** (unchanged) |
| Which day / which transaction? | **Transactions** (calendar, lists) |
| Am I within my limits per category? Bills? | **Budgets** (category limits, Recurring) |
| Where did it go, is that normal, how is it trending? | **Insights** (this plan) |

## 4. The new screen

```
┌──────────────────────────────┐
│   ‹   October 2026   ›       │  month switcher (unchanged)
├──────────────────────────────┤
│        ╭────────╮            │
│       ╱  ₹18.6k  ╲           │  1. WHERE IT WENT
│      │   spent    │          │     ring by category, total in the middle
│       ╲          ╱           │
│        ╰────────╯            │
│  ● Food        ₹7.1k   ↑     │     top 4 categories + Other
│  ● Shopping    ₹4.2k   ↓     │     arrow = vs your usual month
│  ● Transport   ₹2.9k   ·     │
│  ● Bills       ₹2.4k   ·     │
│  ● Other       ₹2.0k         │
├──────────────────────────────┤
│  CHANGED                      │  2. CHANGED (only when notable)
│  [Food ↑ ₹1.4k] [Travel ↓ ₹600]│     max 2 chips
├──────────────────────────────┤
│  TREND                        │  3. TREND
│  ▂ ▃ ▅ ▃ ▄ █   ---- usual    │     6 months, current highlighted
│  M J J A S O                  │     tap a bar = switch month
└──────────────────────────────┘
```

### 4.1 Where it went (always shown when the month has spending)

- **Ring**: debit spend by category for the month, recurring bills included (they are part of where money went;
  see open question Q1). Top 4 categories by amount + "Other". Category colours/icons from the category itself.
- **Centre**: the month's total spent, compact. Label "spent" (one word).
- **Legend rows** (5 max): dot, category name, compact amount, trend arrow vs usual:
  `↑` (red-ish token) when notably higher, `↓` (green-ish token) when notably lower, `·` (muted) otherwise, nothing at
  all when there is no "usual" yet. No percentages on the main screen.
- **Tap** a slice or a row → Category sheet (4.4). Tap "Other" → sheet listing the remaining categories.
- Replaces: summary card, payee donut, income donut, top expenses, fixed costs card.

### 4.2 Changed (conditional)

- Up to **2 chips**, the categories whose spend moved most against usual, both directions allowed.
- A change is **notable** when `|this − usual| ≥ max(₹500, 25 % of usual)`. Thresholds live in one constant.
- Chip text: `<Category> ↑ ₹1.4k`. Tap → that category's sheet.
- Hidden when: nothing is notable, or there is no "usual" yet (fewer than 1 complete earlier month with data).
- Current month nuance: comparing a half-finished month with full months is unfair. For the **current** month compare
  against usual **to the same day of month** (usual spend by day N). Past months compare full month vs full months.
  This is a fact ("by the 14th you usually spend ₹X"), not a prediction.

### 4.3 Trend

- 6 bars: total spent for the last 6 months ending at the selected month. Selected month highlighted (accent token),
  others muted. A faint dashed line at "usual". Month initials only.
- Tap a bar → switch to that month (same as the switcher).
- Current month bar is drawn as partial (lighter fill above the to-date amount is **not** drawn: no projection).
- Hidden when fewer than 2 months have data.

### 4.4 Category sheet (detail on tap)

One bottom sheet (RN Modal, existing pattern), opened from a slice, legend row or chip:

- Header: category icon + name, month amount (full value), small "Usual ₹X" line (only text line allowed).
- Payees in this category: up to 5 rows (name, amount, count), "Other payees" row.
- "View transactions" → existing `TransactionsList` filtered by category + month (route already exists).
- If the category has a budget: one thin bar "₹6.2k of ₹8k" linking to Budgets. No duplicate budget UI.

### 4.5 Data levels

| Level | Condition (selected month) | Screen |
|---|---|---|
| 0 Empty | no debits | existing teaching empty state (Add expense) |
| 1 Sparse | 1–4 debits | ring + legend, no arrows, no Changed, no Trend; one muted line "Add a few more to see patterns" |
| 2 First month | ≥5 debits, no earlier month with data | ring + legend, no arrows/Changed; Trend hidden |
| 3 Normal | ≥1 earlier month with data | everything; "usual" = median of up to 3 previous complete months with data |

"Usual" uses the **median** (robust to one odd month); with 1 earlier month it is that month, with 2 the mean.

### 4.6 What is removed and where it lives now

| Removed | Where the user finds it |
|---|---|
| Summary card (net, % saved, income, budget) | Home hero + MonthStatRow |
| Daily cashflow chart | Transactions calendar |
| Who you paid (payee donut) | Category sheet → payees |
| Who paid you (income donut) | Home income; Transactions filtered by credit |
| Top expenses | Category sheet; Transactions |
| Fixed costs card | Budgets → Recurring; "Bills" slice in the ring |
| Compare screen + launcher | Trend + arrows + Changed |

## 5. Interaction, motion, accessibility

- Ring draws clockwise on first show per month (existing `ClockwiseAnimatedPie`), static under reduced motion.
- Month switch: cross-fade numbers, ring morphs between months; skeletons only when no cached data.
- Tap targets ≥ 44 pt; legend rows are the primary targets (slices are small on narrow phones).
- Screen reader: ring has one summary label ("Spent ₹18,620 in October. Food ₹7,076, up ₹1,400 on usual. …");
  legend rows and chips read full amounts; arrows read "higher than usual" / "lower than usual" / "about usual".
- Colour is never the only signal: arrows carry the meaning, categories keep their icons.
- Dark mode via theme tokens only (lint enforces it).

## 6. Data and API

New endpoint, additive (old `month-insights` stays for the email digest and installed apps):

`GET /api/v1/insights/month?year&month&timezone`

```jsonc
{
  "year": 2026, "month": 10, "today": "2026-10-14",
  "is_current": true,
  "data_level": 3,                    // 0..3 as in 4.5
  "spent": "18620.00",
  "debit_count": 41,
  "categories": [                     // all categories with spend, sorted desc; client groups top 4 + Other
    { "id": "…", "name": "Food & Dining", "icon_name": "UtensilsCrossed", "color": "…",
      "is_fixed": false, "amount": "7076.00", "usual": "5650.00", "change": "up" }   // up | down | same | null
  ],
  "changes": [ { "category_id": "…", "delta": "1426.00" } ],   // ≤2, already thresholded
  "usual_spent": "19900.00",          // to-date for the current month, full month otherwise; null when unknown
  "trend": [ { "year": 2026, "month": 5, "spent": "21000.00" }, … ]   // 6 entries, oldest first, 0 for empty months
}
```

- SQL-side aggregation in one D1 batch: month by category; previous 3 complete months by category (to-date variant
  for the current month); 6-month totals. All index-backed by `(user_id, transaction_at)`.
- Category payee breakdown for the sheet: `GET /api/v1/insights/category?category_id&year&month&timezone` (or reuse
  the payee list endpoint with a category filter if it exists; decide in exploration).
- ETag/304 already applies. Past months never change unless the user edits old rows, so revalidation is a 304.
- Frontend prefetches the neighbouring months on idle; persisted snapshot keeps current + previous month (policy
  already in `queryCachePolicy.ts`; add the new keys).
- Realtime/after-write: invalidate the new keys through `invalidateTransactionAggregates`.

## 7. Other things that move with it

- **Tours:** the Insights tab tour (`tabTours.ts` ~384–444) and sample data get new steps: Where it went → Changed →
  Trend → tap for detail. Targets `insightsCashflow`, `insightsPayees`, `insightsCompare(Snapshot)` are retired.
- **Navigation:** `InsightsMonthCompare` route removed (types, stack, tour types). Agent deep links to payee lists
  stay (they open Transactions, not Insights).
- **Email digest:** untouched (uses the old endpoint).
- **Glossary** (Settings → Glossary): update/remove entries for removed concepts; add "Usual".
- **Dead code:** cashflow chart, donut components, compare components and their utils/tests are deleted once unused.

## 8. Build phases

1. **Mock-up** (artifact, sample data, both themes) → owner review → adjust. No code.
2. **API**: new endpoint(s) + tests (data levels, median/usual, to-date comparison, thresholds, timezone month edges,
   empty months in trend). Deploys on merge; additive, safe for installed apps.
3. **App**: new screen + sheet + data-level states + tours + glossary; remove old cards/compare screen; tests.
4. **Review + emulator pass**, then one OTA together with the offline batch.

## 9. How we'll know it's better

- Owner + 2–3 real users: "open Insights, tell me where your money went and if anything is unusual" — answered in
  under 5 seconds without scrolling.
- Optional (ties to the parked activation-metrics work): count Insights opens and sheet opens per active user.

## 10. Decisions (2026-10-24)

- **Bills in the ring:** yes, recurring bills are ordinary categories in the ring (the true picture).
- **Income:** one small muted "Income ₹X" line under the ring; nothing else about income on Insights.
- **Chart:** ring with the total in the middle (the stacked bar is in the mock-up for comparison only).
- **Categories first**, payees inside the category sheet.
- **Wording:** "usual".
- **Ring colours:** monochrome accent shades + grey "Other", as the app's existing donut (`donut.slices`); category
  colours only appear as dots in the sheet header if at all.
- Week view: out of scope.

Mock-up: https://claude.ai/artifact/AWgZRAJfh5zF1yLXPTmyDt (light ring, stacked bar, dark, category sheet, first month,
few entries; tap rows, chips, bars and the month arrows).
