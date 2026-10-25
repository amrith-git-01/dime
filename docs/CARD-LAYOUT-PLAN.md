# Rearrangeable cards: Home, Budgets, Insights

Status: **draft plan for discussion** (2026-10-24). Nothing built yet. The Insights redesign
(`docs/INSIGHTS-REDESIGN-PLAN.md`) is parked; this plan works with today's Insights cards and makes any later redesign
easier, because cards become registry entries instead of hard-coded JSX.

## 1. Goal

People can change the order of the cards on Home, Budgets and Insights, and the move feels smooth and native: lift,
drag, the other cards make room, drop, a light haptic. The order is remembered and follows the user to a new phone.

Non-goals (for now): resizing cards, cards on a different tab than their own, user-made cards, widgets.

## 2. What is a "card" on each screen today

| Screen | Cards, top to bottom | Built as |
|---|---|---|
| Home (`features/home/components/HomeContent.tsx`) | Hero month card · sync status (Pending chip / "Updated…") · Get started (until done) · Month stats · Upcoming · Top categories · Recent transactions | ScrollView |
| Budgets (`screens/budget/BudgetScreen.tsx`) | Budget summary · Recurring · Category budgets (header + rows) | FlashList: the first two live in the list header, category rows are the list items |
| Insights (`screens/analytics/AnalyticsScreen.tsx`) | Month switcher · Month summary · Fixed costs · Daily cashflow · Who you paid · Who paid you · Top expenses · Compare | ScrollView |

Proposed **pinned** (not movable) items, because they are context for everything below them:

- Home: Hero month card (with the sync status attached to it), Get started (temporary onboarding card, stays under
  the hero until it retires).
- Insights: Month switcher.
- Budgets: none pinned (three movable blocks).

Everything else is a movable card.

## 3. The user experience

### Entering and leaving edit mode
- **Long-press any movable card** (≈400 ms, haptic tick) → the screen enters **Edit layout** mode. Also reachable from
  a visible place for people who never long-press: **Settings → Home & screens → Arrange cards**, and a small
  "Arrange" entry at the bottom of each screen (optional, see Q4).
- In edit mode every movable card **collapses to a compact tile** (icon + title, 56 pt tall, a drag handle on the
  right). Collapsing is what makes dragging smooth: the whole screen's cards fit in view, no auto-scroll over tall
  charts, and every slot has the same height so the maths is trivial and stable.
- Pinned items show as a faded, non-draggable tile with a small lock, so the user understands why they can't move.
- A top bar replaces the header: **Reset** (left), **Done** (right). Leaving the tab or backgrounding the app also
  ends edit mode and saves.
- Expanding back to full cards animates (layout transition), and the screen scrolls to keep the card the user last
  touched in view.

### Dragging
- Press-and-hold on a tile (or grab the handle immediately) lifts it: scale 1.03, shadow, slight tilt off.
- Other tiles slide out of the way with a spring as the lifted tile crosses their midpoint; a tick haptic on each
  swap. Dropping settles with a spring; a confirm haptic.
- Movement is UI-thread only (Reanimated shared values + Gesture Handler), so it stays at 60/120 fps even while
  queries refetch.
- Reduced motion: no scale/tilt; swaps are instant; still fully usable.

### Accessibility
- Screen readers can't drag, so each tile has **accessibility actions** "Move up" / "Move down" / "Move to top", and
  announces the new position ("Upcoming, 2 of 5").
- Tiles are ≥ 56 pt tall; the handle is a real button with a label.

### Optional: hide cards (see Q1)
- In edit mode each tile has a switch/eye toggle. Hidden cards drop to a "Hidden" group at the bottom of the edit list
  and can be brought back. Pinned cards cannot be hidden.

## 4. How it works

### 4.1 Card registry (one per screen)
```ts
type CardDef = {
  id: HomeCardId;              // stable string, e.g. "home.upcoming"
  title: string;               // shown on the compact tile and to screen readers
  icon: IconName;
  pinned?: boolean;            // not movable / not hideable
  render: () => ReactNode;     // the existing card component, unchanged
};
```
- `HomeContent`, `BudgetScreen` and `AnalyticsScreen` render `orderedCards(registry, layout)` instead of fixed JSX.
  The card components themselves do not change.
- Cards that render nothing in some states (Get started after it retires, Upcoming with no items, the income donut
  with no income) keep their slot; they simply render null.

### 4.2 Layout model and normalisation
```ts
type ScreenLayout = { v: 1; order: CardId[]; hidden: CardId[] };
```
- `normalizeLayout(saved, registry)` is pure and tested: drops unknown ids (a removed card), inserts new cards at their
  default position relative to their default neighbours, keeps pinned cards at their fixed position, de-duplicates.
  This is what keeps old saved layouts working when cards are added/removed by a future update (e.g. the Insights
  redesign).

### 4.3 Where the layout is saved
- **Server (source of truth, syncs across devices):** one nullable `card_layouts` TEXT (JSON) column on
  `user_settings` (migration `0013`), exposed through the existing `GET/PATCH /api/v1/me/settings` as
  `card_layouts: { home?: ScreenLayout, budgets?: ScreenLayout, insights?: ScreenLayout }`. Zod-validated (known
  screens, max 30 ids, id pattern), size-capped. Additive: installed apps ignore it.
- **Device:** settings are already mirrored in MMKV (`lib/settings/userSettingsMmkv.ts`) and restored before first
  paint, so the saved order renders instantly with no layout jump on launch.
- Saving: optimistic update of the settings query on drop, one debounced PATCH when edit mode ends (not per swap).
  Offline: the PATCH waits like other settings writes; the local order already applies.

### 4.3a No-jitter rules
- **Local copy wins on screen.** The layout is read synchronously from MMKV before first paint; launches never show the
  default order first.
- **Edit mode is local only.** No query update can change the order while editing.
- **Done = one save.** Optimistic update, cancel in-flight settings queries before writing, one PATCH. The echo carries
  the same order, so nothing re-renders.
- **Refetches don't redraw.** Unchanged settings come back as an ETag 304 / structurally equal data.
- **Remote changes (another device) are deferred:** never applied while that screen is focused; applied on the next
  focus or launch, with a layout animation (no jump).
- **New phone, no local copy:** the card area waits up to ~1 s for settings (skeletons); after that it shows the
  default order and keeps it for that visit, applying the saved order on the next open.

### 4.4 The sortable component
- One shared `components/layout/SortableCardList` used by all three screens in edit mode.
- Built on what is already installed: **react-native-reanimated 4 + react-native-gesture-handler**, no new native
  dependency, so it ships by OTA. Fixed tile height means position = index × height; the dragged tile follows the
  finger, the others animate to their new index with `withSpring`. Order is committed to React state on drop only.
- Considered and rejected: third-party drag lists (most target older Reanimated versions or virtualised lists we don't
  need; a ~200-line component we own is easier to keep smooth and accessible).

### 4.5 Budgets screen change
- Today the category rows are FlashList items with the summary and recurring blocks in its header, so the three blocks
  cannot be reordered. Change it to a ScrollView of three cards (category budgets are typically 5–20 rows; no
  virtualisation needed), or keep FlashList and build header/footer from the layout. Decide in exploration with a
  quick render check for a user with ~40 categories.

### 4.6 Tours and other dependants
- Tours spotlight cards by `TourTarget` id and scroll with `useTourScroller`; they must follow the user's order.
  Verify the scroller measures targets rather than assuming positions, and order tab-tour steps by the current layout
  (or keep the default order and scroll as needed).
- Tours start with edit mode off; starting a tour exits edit mode.
- Get started checklist, Pending chip and "Updated…" stay attached to the hero (pinned).
- Widgets and deep links are unaffected.

## 5. Build phases

1. **API:** migration + settings schema/routes + tests (validation, size cap, unknown screens rejected). Deploys on
   merge; additive.
2. **Foundation:** registries for the three screens, `normalizeLayout`, settings types + MMKV, a `useCardLayout(screen)`
   hook. Screens render from the registry with the default order (no visible change yet). Tests.
3. **Edit mode + SortableCardList:** compact tiles, gestures, haptics, reduced motion, a11y actions, Reset/Done,
   optional hide. Tests for the ordering maths and actions.
4. **Wire up** Home, Budgets (structure change), Insights; tours; Settings entry; copy.
5. **Review + emulator pass** (the drag feel can only be judged on a device), then the OTA together with the offline
   batch.

## 6. Decisions (2026-10-24, supersede the sections above where they differ)

- **Reorder only.** No hiding, no other card options.
- **Every card is movable** on Home, Budgets and Insights, including the Home hero (the Pending chip / "Updated…"
  line travels with it), Get started and the Insights month switcher. Nothing is pinned. Transactions is out of scope.
- **Per user**, saved in `user_settings` and cached on the device (no-jitter rules in 4.3a).
- **Entry point: an "Arrange" button at the end of each of the three screens.** No long-press, no Settings entry.
- **Arranging UI (confirmed, option B):** "Arrange" opens a sheet titled "Arrange <Screen>" with Cancel / Done and a
  list of the screen's card names (icon, name, drag handle ≡). Press-and-hold a row or grab its handle to lift it;
  the other rows slide aside with a tick haptic per swap; drop settles with a spring. Done closes the sheet, the
  screen's cards animate into the new order and the order is saved in the background. Cancel or swipe-down discards.
  "Reset to default" restores the default order in the list (applies only on Done). Screen readers get Move up / Move
  down actions per row. Cards that render nothing in some states (e.g. Get started after it retires) keep their slot.
  This replaces the in-place edit mode and compact tiles of section 3.

## 7. Original open questions (answered above)

- **Q1 Hide as well as reorder?** Recommended yes (people mostly want to remove what they don't use).
- **Q2 Pinned items:** Home hero + Get started, Insights month switcher, nothing on Budgets. Agree?
- **Q3 Sync across devices** (server) or **this phone only** (MMKV)? Recommended: server.
- **Q4 Entry points:** long-press + Settings only, or also a small "Arrange" link at the bottom of each screen?
- **Q5 Compact tiles while editing** (smooth, everything fits) or **drag the full-size cards** (WYSIWYG, but tall
  cards make dragging and auto-scroll clumsy)? Recommended: compact tiles.
