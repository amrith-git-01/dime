# 🎨 Design System — Expense Tracker App

> **Theme:** Violet / Indigo — Light Mode First  
> **Platform:** Android Only  
> **Font:** Inter + JetBrains Mono  
> **Last Updated:** April 2026

---

## 📋 Table of Contents

1. [Color System](#color-system)
2. [Typography](#typography)
3. [Spacing & Layout](#spacing--layout)
4. [Elevation & Shadows](#elevation--shadows)
5. [Border Radius](#border-radius)
6. [Iconography](#iconography)
7. [Animation System](#animation-system)
   - Button Animations
   - List Animations
   - Screen Transition Animations
   - Scroll Animations
   - Skeleton Loaders
   - Empty States
   - Micro-interactions
8. [Gesture Animations](#gesture-animations)
   - Swipe Left — Delete
   - Swipe Right — Categorize
   - Long Press — Multi-select
   - Pull to Refresh
   - Pinch to Zoom — Charts
   - Double Tap — Quick Actions
   - Drag to Reorder
   - Edge Swipe — Go Back
9. [Component States](#component-states)

---

## Color System

### Primary Palette

| Token | Value | Usage |
|---|---|---|
| `color.primary` | `#6355E8` | CTA buttons, active tab, FAB, links |
| `color.primaryLight` | `#7C6EF8` | Hover states, highlights, pressed states |
| `color.primaryMuted` | `#EEEDFB` | Icon backgrounds, tag backgrounds, subtle fills |
| `color.primaryDark` | `#4D3FD1` | Pressed/active button state |

### Background Hierarchy

The background system follows a layered approach — each layer sits visually above the previous one. This creates natural depth without heavy shadows.

| Token | Value | Usage |
|---|---|---|
| `color.background` | `#F5F4FF` | App base background — every screen sits on this |
| `color.surface` | `#FFFFFF` | Cards, list items, input fields |
| `color.surfaceElevated` | `#EEEEFF` | Modals, bottom sheets, popovers |
| `color.surfaceOverlay` | `#F0EFFF` | Tooltip backgrounds, dropdown menus |

### Text Colors

| Token | Value | Usage |
|---|---|---|
| `color.textPrimary` | `#0A0A1F` | Headings, primary content, amounts |
| `color.textSecondary` | `#6B6B80` | Subtitles, captions, timestamps, labels |
| `color.textDisabled` | `#B0B0C4` | Inactive inputs, placeholder text |
| `color.textInverse` | `#FFFFFF` | Text on primary colored backgrounds |
| `color.textLink` | `#6355E8` | Tappable text links |

### Border & Divider

| Token | Value | Usage |
|---|---|---|
| `color.border` | `#E0DFFA` | Card borders, input outlines |
| `color.borderLight` | `#EEEEFF` | Subtle section dividers |
| `color.borderFocus` | `#6355E8` | Input focus ring |

### Semantic Colors

These are consistent across all themes and carry universal meaning. Never repurpose these colors for anything other than their intended meaning.

| Token | Value | Usage |
|---|---|---|
| `color.success` | `#16A34A` | Income, credits, refunds, positive states |
| `color.successMuted` | `#DCFCE7` | Success state backgrounds |
| `color.warning` | `#D97706` | 80% budget reached, caution states |
| `color.warningMuted` | `#FEF3C7` | Warning state backgrounds |
| `color.danger` | `#DC2626` | Budget exceeded, delete actions, errors |
| `color.dangerMuted` | `#FEE2E2` | Danger state backgrounds |
| `color.info` | `#2563EB` | Neutral informational states |
| `color.infoMuted` | `#DBEAFE` | Info state backgrounds |

### Category Colors

Each category has a primary color and a muted background variant (10% opacity of primary). Used in icons, transaction strips, donut chart segments, and budget progress bars.

| Category | Color | Muted BG | Hex |
|---|---|---|---|
| 🍔 Food & Dining | Coral Red | `#FF6B6B20` | `#FF6B6B` |
| 🚗 Transport | Teal | `#4ECDC420` | `#4ECDC4` |
| 🛍️ Shopping | Purple | `#A855F720` | `#A855F7` |
| 💊 Health | Mint Green | `#4ADE8020` | `#4ADE80` |
| 🎬 Entertainment | Orange | `#FB923C20` | `#FB923C` |
| 💡 Utilities | Amber | `#FBBF2420` | `#FBBF24` |
| ✈️ Travel | Indigo | `#818CF820` | `#818CF8` |
| 📚 Education | Pink | `#F472B620` | `#F472B6` |
| 💰 Income / Credit | Emerald | `#34D39920` | `#34D399` |
| 📦 Others | Slate | `#94A3B820` | `#94A3B8` |

### Spending Card Gradient

The home screen spending card uses a linear gradient for depth:

```
gradient.spendingCard = linear-gradient(135deg, #6355E8 0%, #8B7FF5 100%)
```

For a slightly more vibrant variant on high-spend months:
```
gradient.spendingCardWarm = linear-gradient(135deg, #6355E8 0%, #9B6EF8 100%)
```

---

## Typography

### Font Families

```
font.body     = "Inter"          // All UI text, labels, body copy
font.mono     = "JetBrains Mono" // All monetary amounts and numeric data
```

**Why two fonts:**
- **Inter** is optimized for UI readability at all sizes — clean, neutral, highly legible
- **JetBrains Mono** is used exclusively for money — monospaced digits mean currency figures always align perfectly in lists, and the visual distinction makes amounts instantly scannable

Both fonts are loaded via **Expo Google Fonts** (`@expo-google-fonts/inter`, `@expo-google-fonts/jetbrains-mono`).

---

### Type Scale

#### Display — Home Screen Hero Numbers

```
font.display.size      = 40sp
font.display.weight    = 800 (ExtraBold)
font.display.family    = JetBrains Mono
font.display.tracking  = -1.5px
font.display.height    = 48sp

Usage: "₹12,480" on home screen spending card
```

---

#### Heading 1 — Screen Titles

```
font.h1.size      = 28sp
font.h1.weight    = 700 (Bold)
font.h1.family    = Inter
font.h1.tracking  = -0.5px
font.h1.height    = 34sp

Usage: "Transactions", "Insights", "Budgets" screen headers
```

---

#### Heading 2 — Section Titles

```
font.h2.size      = 22sp
font.h2.weight    = 700 (Bold)
font.h2.family    = Inter
font.h2.tracking  = -0.3px
font.h2.height    = 28sp

Usage: "This Month", "Recent Transactions", "Your Budgets"
```

---

#### Heading 3 — Card Titles & Sub-sections

```
font.h3.size      = 18sp
font.h3.weight    = 600 (SemiBold)
font.h3.family    = Inter
font.h3.tracking  = -0.2px
font.h3.height    = 24sp

Usage: Card headers, modal titles, sheet titles
```

---

#### Body Large — Primary Readable Content

```
font.bodyLarge.size      = 16sp
font.bodyLarge.weight    = 400 (Regular)
font.bodyLarge.family    = Inter
font.bodyLarge.tracking  = 0px
font.bodyLarge.height    = 24sp

Usage: Merchant names in transaction list, setting labels, onboarding text
```

---

#### Body Medium — Standard UI Text

```
font.bodyMedium.size      = 14sp
font.bodyMedium.weight    = 400 (Regular)
font.bodyMedium.family    = Inter
font.bodyMedium.tracking  = 0px
font.bodyMedium.height    = 20sp

Usage: Category labels, notification body, description text
```

---

#### Label — UI Labels & Chips

```
font.label.size      = 12sp
font.label.weight    = 500 (Medium)
font.label.family    = Inter
font.label.tracking  = 0.2px
font.label.height    = 16sp

Usage: Category chips, date labels, filter tags, badge text
```

---

#### Caption — Timestamps & Metadata

```
font.caption.size      = 11sp
font.caption.weight    = 400 (Regular)
font.caption.family    = Inter
font.caption.tracking  = 0.1px
font.caption.height    = 14sp

Usage: "Today, 9:41 PM", "3 transactions", version numbers
```

---

#### Micro — Status & Badges

```
font.micro.size      = 10sp
font.micro.weight    = 600 (SemiBold)
font.micro.family    = Inter
font.micro.tracking  = 0.5px (slightly more spaced for legibility)
font.micro.height    = 12sp

Usage: "DEBIT", "CREDIT", "UPI" badges on transactions
         Always UPPERCASE when used as status badge
```

---

### Monetary Type Scale (JetBrains Mono)

| Token | Size | Weight | Usage |
|---|---|---|---|
| `font.money.hero` | 40sp | 800 | Home screen "left to spend" |
| `font.money.large` | 28sp | 700 | Spending card total |
| `font.money.medium` | 20sp | 600 | Transaction detail view amount |
| `font.money.standard` | 16sp | 500 | Transaction list row amount |
| `font.money.small` | 13sp | 500 | Budget progress labels |
| `font.money.caption` | 11sp | 400 | Chart axis labels |

---

### Visual Hierarchy Rules

These rules must be followed consistently across all screens to maintain a clear reading order:

**Rule 1 — One hero per screen**
Every screen has exactly one element at the top of the visual hierarchy. On Home it's the spending amount. On Transactions it's the screen title. Never compete for attention.

**Rule 2 — Maximum 3 hierarchy levels per card**
A transaction card has: Merchant name (primary) → Category + Time (secondary) → Amount (accent). Never more than 3 levels in a single component.

**Rule 3 — Amounts are always right-aligned**
Every monetary value in a list is right-aligned. This allows instant column-scanning and mirrors how humans naturally read financial tables.

**Rule 4 — Color reinforces hierarchy, not creates it**
Size and weight establish hierarchy first. Color is used to reinforce it — not as the primary differentiator. Never rely on color alone to communicate importance.

**Rule 5 — Debit vs Credit color coding**
- Debits: `color.textPrimary` (`#0A0A1F`) — neutral, expected
- Credits / Income: `color.success` (`#16A34A`) with `+` prefix — positive, celebrated

---

## Spacing & Layout

### Base Unit

All spacing is derived from a **4dp base unit**. This ensures everything aligns to a consistent grid.

```
space.1  =  4dp
space.2  =  8dp
space.3  = 12dp
space.4  = 16dp   ← Standard padding
space.5  = 20dp
space.6  = 24dp   ← Section spacing
space.8  = 32dp
space.10 = 40dp
space.12 = 48dp
space.16 = 64dp
```

### Layout Constants

```
layout.screenPaddingH  = 16dp   // Horizontal screen edge padding
layout.screenPaddingV  = 20dp   // Top padding below header
layout.cardPadding     = 16dp   // Internal card padding
layout.sectionGap      = 24dp   // Gap between major sections
layout.listItemGap     = 8dp    // Gap between list items
layout.bottomNavHeight = 64dp   // Bottom navigation bar height
layout.fabSize         = 56dp   // FAB diameter
layout.fabMargin       = 16dp   // FAB distance from screen edge
```

---

## Elevation & Shadows

Shadows are subtle and purposeful — they indicate interactability and layering, not decoration.

### Shadow Tokens

```
// Level 0 — No elevation (flat, background-level)
shadow.0 = none

// Level 1 — Cards, list items
shadow.1 = {
  offsetX: 0,
  offsetY: 2,
  blur: 8,
  spread: 0,
  color: rgba(99, 85, 232, 0.06)
}

// Level 2 — Floating cards, selected states
shadow.2 = {
  offsetX: 0,
  offsetY: 4,
  blur: 16,
  spread: 0,
  color: rgba(99, 85, 232, 0.10)
}

// Level 3 — Bottom sheets, modals
shadow.3 = {
  offsetX: 0,
  offsetY: 8,
  blur: 32,
  spread: 0,
  color: rgba(99, 85, 232, 0.12)
}

// Level 4 — FAB, primary action buttons
shadow.4 = {
  offsetX: 0,
  offsetY: 8,
  blur: 24,
  spread: 0,
  color: rgba(99, 85, 232, 0.35)   // Colored shadow matches primary
}
```

Note: The FAB and primary buttons use a **colored shadow** (violet-tinted) rather than a grey shadow. This makes the primary action feel premium and intentional.

---

## Border Radius

```
radius.xs   =  6dp   // Badges, chips, small tags
radius.sm   = 10dp   // Input fields, small buttons
radius.md   = 14dp   // Transaction list items, cards
radius.lg   = 20dp   // Main cards (spending card, budget cards)
radius.xl   = 24dp   // Bottom sheets, modals
radius.2xl  = 32dp   // Full-screen overlays
radius.full = 9999dp // Pills, FAB, avatar circles
```

---

## Iconography

**Library:** `lucide-react-native` — consistent stroke-based icons, clean and modern.

**Icon Sizes:**

```
icon.xs  = 14dp  // Inside badges
icon.sm  = 16dp  // Inline with caption text
icon.md  = 20dp  // Standard UI icons (nav, buttons)
icon.lg  = 24dp  // Section headers, prominent actions
icon.xl  = 32dp  // Empty state illustrations
icon.2xl = 48dp  // Onboarding icons
```

**Icon Weight:** Always use stroke width `1.5` for Lucide icons at `md` and above. Use `2` for small sizes (`xs`, `sm`) to maintain legibility.

**Category Icons:** Custom emoji rendered inside colored rounded containers using the category muted background color. Never bare emojis in lists — always containerized.

---

## Animation System

All animations are implemented using **Reanimated 3** with spring physics unless stated otherwise. No `duration`-based animations for interactive elements — spring physics feels natural and responds to interruption correctly.

### Spring Presets

```javascript
// Snappy — for immediate feedback (button press, toggle)
spring.snappy = {
  damping: 18,
  stiffness: 300,
  mass: 0.8,
}

// Smooth — for cards, panels, modals appearing
spring.smooth = {
  damping: 20,
  stiffness: 200,
  mass: 1,
}

// Gentle — for large elements, screen transitions
spring.gentle = {
  damping: 24,
  stiffness: 150,
  mass: 1.2,
}

// Bouncy — for celebratory moments (goal hit, budget saved)
spring.bouncy = {
  damping: 12,
  stiffness: 280,
  mass: 0.9,
}
```

---

### 1. Button Animations

#### Primary Button (CTA)

On press-in, the button scales down and darkens slightly. On press-out, it springs back with a slight overshoot.

```javascript
// Press in
scale:      1.0 → 0.96   (spring.snappy)
background: color.primary → color.primaryDark
shadow:     shadow.4 → shadow.2

// Press out
scale:      0.96 → 1.0   (spring.bouncy — slight overshoot to 1.02)
background: color.primaryDark → color.primary
shadow:     shadow.2 → shadow.4
```

**Haptic feedback:** `Haptics.impactAsync(ImpactFeedbackStyle.Light)` on press-in.

---

#### FAB (Floating Action Button)

The FAB has the most prominent animation — it is the primary action of the entire app.

```javascript
// Idle state — subtle breathing pulse (loop)
scale: 1.0 → 1.04 → 1.0
duration: 2800ms ease-in-out (CSS timing, not spring)
opacity of shadow: 0.35 → 0.5 → 0.35

// On press
scale:    1.0 → 0.90   (spring.snappy, immediate)
rotation: 0° → 45°     (spring.snappy) // + becomes ×

// FAB expand (if multi-action)
child actions stagger up: translateY(0) → translateY(-60px * n)
opacity: 0 → 1
delay between each child: 40ms
spring: spring.smooth
```

**Haptic feedback:** `Haptics.impactAsync(ImpactFeedbackStyle.Medium)` on FAB press.

---

#### Icon Buttons & Tab Bar

```javascript
// Tab bar active transition
icon scale:     1.0 → 1.15 → 1.0  (spring.bouncy)
indicator dot:  scaleX 0 → 1       (spring.smooth)
label weight:   400 → 700           (instant)
color:          textSecondary → primary (80ms ease)
```

---

#### Destructive Button (Delete)

```javascript
// Press in
scale:      1.0 → 0.94
background: dangerMuted → danger
color:      danger → white
spring:     spring.snappy

// Shake animation (if confirming irreversible delete)
translateX: 0 → -6 → 6 → -4 → 4 → -2 → 2 → 0
duration:   400ms, timing: ease-in-out
```

---

### 2. List Animations

#### Transaction List — Initial Load

Items enter the list staggered from bottom to top. Each item slides up and fades in.

```javascript
// Per item
translateY: 24 → 0   (spring.smooth)
opacity:    0  → 1   (spring.smooth)

// Stagger
delay per item = index * 50ms
max stagger cap = 300ms (items beyond index 6 all use 300ms delay)
```

---

#### Transaction List — New Item Added (SMS detected)

When a new transaction is auto-detected and confirmed, it inserts at the top of the list with a highlight flash.

```javascript
// Entry
translateY: -16 → 0  (spring.bouncy)
opacity:    0   → 1  (spring.smooth)
scaleY:     0.8 → 1  (spring.smooth)

// Highlight flash
background: primaryMuted → surface
duration:   600ms, ease-out
// Fades from the primary muted color to normal card surface
```

---

#### Transaction List — Delete (Swipe)

```javascript
// Swipe left reveal
translateX: 0 → -80dp  (follows gesture, no spring during drag)

// Confirm delete
translateX: -80 → -screenWidth  (spring.snappy)
height:     itemHeight → 0       (spring.smooth, 150ms delay after swipe out)
opacity:    1 → 0                (200ms ease-out)
// Remaining items slide up smoothly to fill gap
```

---

#### Category Chips — Horizontal Scroll

```javascript
// Selection tap
scale:      1.0 → 0.94 → 1.0   (spring.snappy)
background: surface → primaryMuted
border:     border → primary
```

---

### 3. Screen Transition Animations

React Navigation v7 configured with custom transitions using Reanimated 3.

#### Main Stack Push (go deeper — e.g. Transaction Detail)

```javascript
// Incoming screen
translateX:  screenWidth → 0   (spring.gentle)
opacity:     0.8 → 1

// Outgoing screen
translateX:  0 → -screenWidth * 0.3   (spring.gentle)
opacity:     1 → 0.6
scale:       1 → 0.96
```

---

#### Bottom Tab Switch

```javascript
// No slide — fade only (sliding tabs feels disorienting)
opacity:    0.7 → 1   (120ms ease-out)
translateY: 4 → 0     (spring.smooth)
```

---

#### Bottom Sheet — Appear (SMS detected, manual log, filters)

```javascript
// Sheet enter
translateY: sheetHeight → 0   (spring.smooth)
// Backdrop
opacity: 0 → 0.5              (200ms ease-out)

// Sheet dismiss
translateY: 0 → sheetHeight   (spring.snappy)
// Backdrop
opacity: 0.5 → 0              (150ms ease-in)
```

---

#### Modal — Full Screen (Receipt scan result, Onboarding)

```javascript
// Enter
translateY: 40 → 0   (spring.smooth)
opacity:    0  → 1   (200ms ease-out)
scale:      0.95 → 1 (spring.smooth)

// Exit
translateY: 0 → 40   (spring.snappy)
opacity:    1  → 0   (150ms ease-in)
scale:      1 → 0.96
```

---

### 4. Scroll Animations

#### Home Screen Spending Card — Parallax on Scroll

As the user scrolls down, the spending card collapses into a compact header.

```javascript
// Card collapse
scrollY 0 → 80:
  cardHeight:   220 → 72
  titleOpacity: 1   → 0     (fades out at scrollY 40)
  amountScale:  1   → 0.65
  amountTranslateY: 0 → -20

// Compact header fade in
scrollY 60 → 80:
  compactHeaderOpacity: 0 → 1
  compactAmount fades in at scrollY 70
```

---

#### Insights Charts — Scroll Into View

Chart elements animate in when they scroll into the viewport.

```javascript
// Chart container
opacity:    0 → 1     (spring.smooth, triggered on scroll into view)
translateY: 20 → 0    (spring.smooth)

// Chart bars / segments — staggered draw
// Bar chart: each bar grows from 0 height
scaleY: 0 → 1         (spring.bouncy, staggered 60ms per bar)
transformOrigin: bottom

// Donut chart: arc draws in
strokeDashoffset: circumference → 0   (800ms ease-out)
// Segments stagger with 100ms delay each
```

---

#### Pull to Refresh

```javascript
// Custom Reanimated pull-to-refresh
// Spinner uses a custom Lottie animation (violet spinner)
threshold: 80dp pull
spinnerScale: 0 → 1    (linear with pull distance)
onRelease: spring back (spring.bouncy)
```

---

### 5. Skeleton Loaders

Skeletons are shown instead of empty space while data loads. They must match the exact shape and layout of the real content they replace.

#### Skeleton Animation

All skeletons use a **shimmer sweep** — a diagonal highlight that moves left to right continuously.

```javascript
// Shimmer implementation
background: linear-gradient(
  90deg,
  #E8E7F8 0%,       // base skeleton color (light violet tint)
  #F0EFFD 50%,      // highlight
  #E8E7F8 100%
)
backgroundSize: 200% 100%
animation: shimmer 1600ms ease-in-out infinite

@keyframes shimmer {
  0%   { backgroundPosition: -200% 0 }
  100% { backgroundPosition: 200% 0 }
}
```

---

#### Home Screen Skeleton

```
┌──────────────────────────────────┐
│  ░░░░░░ (greeting text)          │
│  ░░░░░░░░░░░ (name)              │
│                                  │
│  ┌──────────────────────────┐    │
│  │  ░░░░░░░░░░░░░░░░░░░░░  │    │  ← Spending card skeleton
│  │  ░░░░░░░░░░             │    │    Full card with shimmer
│  │  ░░░░░░░░░░░░░░░░       │    │
│  └──────────────────────────┘    │
│                                  │
│  ░░ ░░ ░░ ░░ ░░ ░░  (cats)      │  ← 6 circular category skeletons
│                                  │
│  ░░░░░░░░░░░░░░░░░░░░░░░        │  ← Transaction skeleton rows × 4
│  ░░░░░░░░░░░░░░░░░              │
│  ░░░░░░░░░░░░░░░░░░░            │
│  ░░░░░░░░░░░░░░░░               │
└──────────────────────────────────┘
```

**Transaction row skeleton:**
```
[○○○○] [░░░░░░░░░░  ] [░░░░░░]
        [░░░░░░      ]

// Circle for icon, two lines for merchant+time, amount on right
```

---

#### Insights Screen Skeleton

```
// Donut chart skeleton
Circle: 120dp diameter, stroke-only circle with shimmer
Center text: two skeleton lines

// Bar chart skeleton
8 rectangular bars of varying heights, all with shimmer
// Heights randomized slightly to look realistic:
heights: [60%, 80%, 45%, 95%, 70%, 55%, 88%, 65%]
```

---

#### Budget Cards Skeleton

```
// Per budget card
[░░░░░░░░░░░░░░░░░░]   (category name)
[░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  (full-width progress bar)
[░░░░░]         [░░░░░]          (spent / total labels)
```

---

### 6. Empty States

Empty states appear when there is no data to display. They should feel encouraging, not clinical.

**Empty state anatomy:**
1. Illustration (Lottie or custom SVG — never stock icons)
2. Headline (friendly, 1 line)
3. Subtext (explanatory, max 2 lines)
4. Action button (optional — clear CTA)

**Empty state animation:**
```javascript
// All empty states entrance
opacity:    0 → 1      (300ms ease-out)
translateY: 20 → 0     (spring.smooth)
// Illustration has a subtle idle float loop
translateY: 0 → -6 → 0 (3000ms ease-in-out, infinite)
```

---

#### Empty States by Screen

**Transactions — No expenses yet**
```
Illustration: Wallet with sparkles (Lottie, loops gently)
Headline:     "Nothing here yet"
Subtext:      "Your transactions will appear here automatically
               once we detect your first payment"
Button:       "Add manually" → opens FAB sheet
```

**Transactions — No search results**
```
Illustration: Magnifying glass (static SVG)
Headline:     "No results found"
Subtext:      "Try a different merchant name, amount, or date"
Button:       "Clear search"
```

**Budgets — No budgets set**
```
Illustration: Piggy bank (Lottie, coins dropping)
Headline:     "Set your first budget"
Subtext:      "Tell us how much you want to spend each month
               and we'll keep you on track"
Button:       "Create budget" → opens budget setup sheet
```

**Insights — Not enough data**
```
Illustration: Bar chart growing (Lottie)
Headline:     "Insights coming soon"
Subtext:      "Keep logging your expenses — your
               spending patterns will appear after a few days"
Button:       None — encouragement only
```

---

### 7. Micro-interactions

Small moments that reward engagement and make the app feel alive.

#### SMS Detection Bottom Sheet

The bottom sheet that appears when a UPI/bank SMS is detected.

```javascript
// Sheet slides up
translateY: sheetHeight → 0   (spring.smooth)

// Transaction details fade in after sheet settles (150ms delay)
opacity:    0 → 1   (spring.smooth)
translateY: 8 → 0

// Confirm button — pulse once to draw attention
scale: 1 → 1.04 → 1   (500ms, once, 400ms after sheet settles)

// Auto-dismiss countdown
// A thin progress bar depletes over 8 seconds
// If user taps confirm before it runs out — confetti burst
```

---

#### Budget Limit Reached

When a transaction pushes a category to 100% of budget:

```javascript
// Progress bar
color transition: warning → danger   (400ms ease)
// Bar shake
translateX: 0 → -4 → 4 → -3 → 3 → 0   (300ms)

// Warning badge appears
scale:   0 → 1.1 → 1   (spring.bouncy)
opacity: 0 → 1
```

---

#### Successful Expense Log

When user confirms a transaction (from bottom sheet or manual):

```javascript
// FAB transforms to checkmark momentarily
iconChange: "+" → "✓"   (instant)
background: primary → success   (200ms ease)
scale:      1 → 1.12 → 1   (spring.bouncy)

// After 800ms, revert to normal FAB
iconChange: "✓" → "+"
background: success → primary   (spring.smooth)

// Haptic
Haptics.notificationAsync(NotificationFeedbackType.Success)
```

---

#### Spending Ring — Home Screen

The arc on the home screen that shows budget usage.

```javascript
// On initial load / screen focus
strokeDashoffset: circumference → targetOffset
spring: spring.gentle
delay: 200ms after screen mounts

// Color transitions by usage %
0-79%:   color.primary    (#6355E8)
80-99%:  color.warning    (#D97706) — smooth 600ms transition
100%+:   color.danger     (#DC2626) — + shake animation

// Number count-up
// The amount counts up from 0 to actual value
duration: 800ms
easing: ease-out cubic bezier
```

---

#### Scroll-to-Top

Tapping the current active tab in the bottom nav scrolls the list back to top.

```javascript
scrollTo: { y: 0, animated: true }
// Uses Reanimated scrollTo with spring.gentle
// List items don't re-animate — only scroll position changes
```

---

#### Long Press — Multi-select Mode

```javascript
// Entering multi-select
// Each list item
scale:     1 → 0.97   (spring.snappy, staggered 20ms per item)

// Selection checkbox appears
translateX: -24 → 0   (spring.bouncy)
opacity:    0   → 1

// Selected item
background: surface → primaryMuted   (200ms ease)
checkmark:  scale 0 → 1              (spring.bouncy)
```

---

## Gesture Animations

All gestures are implemented with **React Native Gesture Handler v2** using the `Gesture` API. Every gesture has three phases: **active** (finger moving), **end** (finger lifted), and **cancelled** (interrupted). All three must be handled — never leave a gesture in a broken visual state.

### Gesture Velocity Thresholds

```javascript
// These thresholds determine if a gesture "completes" or snaps back
gesture.swipeVelocityX     = 500   // px/s — fast flick confirms action
gesture.swipeDistanceX     = 80dp  // Minimum drag to trigger reveal
gesture.swipeCommitX       = 120dp // Drag past this = auto-commit on release
gesture.longPressDuration  = 400ms // Time before long press fires
gesture.doubleTapDelay     = 300ms // Max time between two taps
gesture.dragActivateY      = 8dp   // Vertical movement to begin drag-to-reorder
```

---

### 1. Swipe Left — Delete

Used on transaction list items and budget cards.

**Visual breakdown:**
```
Resting:    [  🍔 Swiggy          -₹320  ]

Swiping:    [  🍔 Swiggy       -₹320  ] [🗑️ Delete revealed]
            ←─ item translates left ──
            ←─ red background expands from right ──

Committed:  Item slides fully off screen left → collapses height → removed
Cancelled:  Item springs back to resting (spring.smooth)
```

```javascript
// Phase: Active (dragging)
translateX: follows gesture 1:1
// Delete action background
width:      Math.abs(translateX)   // expands as user drags
opacity:    Math.min(translateX / 80, 1)  // fades in proportionally
background: danger (#DC2626)

// Icon in delete zone
// Scales up as user drags past commit threshold
scale: translateX < -120 ? spring(0 → 1.2) : 1.0
icon:  "trash-2" from lucide, color white

// Phase: Released — committed (translateX < -120dp OR velocity > 500)
translateX: currentX → -screenWidth   (spring.snappy)
// After item exits:
height:     itemHeight → 0            (spring.smooth, 150ms delay)
marginBottom: 8 → 0                   (spring.smooth, same timing)
// Remaining items slide up naturally to fill gap

// Phase: Released — cancelled (translateX > -120dp AND velocity < 500)
translateX: currentX → 0   (spring.smooth)
// Delete zone collapses
opacity: current → 0       (200ms ease-out)

// Haptic
// Light tap when crossing the -80dp reveal threshold
Haptics.impactAsync(ImpactFeedbackStyle.Light)
// Medium tap when crossing -120dp commit threshold
Haptics.impactAsync(ImpactFeedbackStyle.Medium)
// Success notification when item is deleted
Haptics.notificationAsync(NotificationFeedbackType.Success)
```

**Important rule:** Only one list item can be in a swiped state at a time. If the user starts swiping a second item, the first one snaps back automatically.

---

### 2. Swipe Right — Categorize

Used on transaction list items. Reveals a category quick-picker inline.

**Visual breakdown:**
```
Resting:    [  🍔 Swiggy          -₹320  ]

Swiping:    [Edit ✏️]  [  🍔 Swiggy   -₹320  ]
            ── item translates right ──→
            ── primary muted background revealed on left ──

Committed:  Category picker sheet slides up from bottom
Cancelled:  Item springs back to resting
```

```javascript
// Phase: Active (dragging right)
translateX: follows gesture 1:1, capped at +100dp
// Action zone background
background: primaryMuted → primaryLight   (gradient as drag increases)
width:      Math.min(translateX, 100)
borderRadius: radius.md on right edge

// Icon in action zone
icon:  "pencil" from lucide, color primary
scale: translateX > 80 ? spring(1 → 1.15) : 1.0  // pops when past threshold

// Phase: Released — committed (translateX > 80dp OR velocity > 500)
translateX: currentX → 0   (spring.bouncy — snaps back)
// Then: Category picker bottom sheet appears
// (see Bottom Sheet animation in Screen Transitions)

// Phase: Released — cancelled
translateX: currentX → 0   (spring.smooth)

// Haptic
Haptics.impactAsync(ImpactFeedbackStyle.Light)   // at 80dp threshold
```

---

### 3. Long Press — Multi-select Mode

Used on transaction list items and budget cards to enter bulk-action mode.

```javascript
// Phase: Press begins (finger down, before long press fires)
scale:      1.0 → 0.98   (spring.snappy, immediate)
// Subtle visual feedback that something is about to happen

// Phase: Long press fires (400ms held)
// Haptic first — then animation
Haptics.impactAsync(ImpactFeedbackStyle.Heavy)

// The pressed item
scale:      0.98 → 0.95 → 1.0   (spring.bouncy — settles back)
background: surface → primaryMuted   (300ms ease)

// All other list items simultaneously
scale:      1.0 → 0.97   (spring.smooth, staggered 15ms per item)
// Creates a "world shrinks" effect — the list feels like it's pulling back

// Checkboxes appear on all items
translateX: -28 → 0   (spring.bouncy, staggered 20ms per item)
opacity:    0   → 1

// Top multi-select action bar slides down
translateY: -56 → 0   (spring.smooth)
opacity:    0   → 1

// Exiting multi-select (tap outside or press X)
// Reverse of all above
// Checkboxes slide back out (spring.snappy)
// Items scale back to 1.0 (spring.smooth)
// Action bar slides back up (spring.snappy)
```

---

### 4. Pull to Refresh

Used on the Transactions screen and Home screen recent transactions feed.

```javascript
// Phase: Pulling (overscroll)
// Custom Reanimated overscroll — replaces default Android overscroll glow

// Refresh indicator (custom violet spinner)
translateY:  -40 → 0         // moves down with pull, capped at 0
scale:        0   → 1        // scales up as user pulls, linear with distance
opacity:      0   → 1        // fades in at 20dp pull, full at 60dp pull

// Spinner rotation begins at 40dp pull
rotation: follows pull distance (1:1 mapping for satisfying feel)

// Threshold indicator — a subtle ring completes as user approaches threshold
strokeDashoffset: circumference → 0   (linear with pull from 20dp to 80dp)
color: textSecondary → primary         (transitions at 60dp pull)

// Phase: Threshold reached (80dp pull)
Haptics.impactAsync(ImpactFeedbackStyle.Medium)
scale:  1.0 → 1.12 → 1.0   (spring.bouncy — confirms threshold)

// Phase: Released past threshold
// Spinner settles at 40dp below top
translateY: current → -40dp   (spring.smooth)
// Spinner enters continuous rotation loop
rotation: infinite, 700ms per revolution, linear

// Phase: Refresh complete
// Spinner does one final full rotation
// Then fades out and translates back up
opacity:    1 → 0     (300ms ease-out)
translateY: -40 → -80 (spring.snappy, simultaneous with opacity)
// List content fades in fresh
```

---

### 5. Pinch to Zoom — Charts

Used on the line chart and bar chart in the Insights screen. Allows users to zoom into specific time ranges.

```javascript
// Gesture: Two-finger pinch on chart
// Uses Gesture.Simultaneous(pinchGesture, panGesture)
// So user can pinch AND pan at the same time

// Phase: Active pinch
scale:       1.0 → pinchScale   (follows gesture 1:1, capped at 3.0x)
translateX:  adjusts to keep focal point centered under fingers

// X-axis labels update in real time as chart scales
// At 1.0x: "Jan Feb Mar Apr May Jun"
// At 2.0x: "Jan 15   Feb 1   Feb 15"
// At 3.0x: "Jan 12   Jan 14   Jan 16"
// Label transition: crossfade 150ms ease

// Phase: Released
// If scale < 1.2x: snap back to 1.0x (spring.smooth)
// If scale >= 1.2x: stay at current scale (spring.gentle settle)

// Pan after zoom
// translateX: follows pan gesture 1:1
// Constrained to chart data bounds — rubber-bands at edges
rubberBandStiffness: 0.15   // How much it resists at bounds

// Double tap to reset zoom
scale:      current → 1.0   (spring.gentle)
translateX: current → 0     (spring.gentle)
Haptics.impactAsync(ImpactFeedbackStyle.Light)
```

---

### 6. Double Tap — Quick Actions

Used on transaction list items for a fast "confirm category" shortcut.

```javascript
// Double tap on a transaction row
// Phase: First tap
// Nothing visible — wait for second tap within 300ms

// Phase: Second tap confirmed
// Flash highlight on the row
background: surface → primaryMuted → surface   (200ms total, ease-in-out)
scale:      1.0 → 1.03 → 1.0                  (spring.bouncy)

// Quick action tooltip appears above the row
// Shows the current category with a checkmark
translateY: 8 → 0    (spring.smooth)
opacity:    0 → 1    (150ms ease-out)
// Auto-dismisses after 1200ms
opacity:    1 → 0    (200ms ease-in, after 1200ms)

// Haptic
Haptics.impactAsync(ImpactFeedbackStyle.Light)

// Use case: User double-taps to confirm AI auto-categorization
// without opening the full transaction detail
```

---

### 7. Drag to Reorder — Budget Cards & Category List

Used on the Budgets screen to reorder budget categories, and in the Category Manager in settings.

```javascript
// Phase: Activation (long press 400ms on drag handle)
Haptics.impactAsync(ImpactFeedbackStyle.Heavy)

// The dragged item
scale:      1.0 → 1.04      (spring.bouncy — lifts up)
shadow:     shadow.1 → shadow.3   (feels like it's lifted off surface)
background: surface → surfaceElevated
opacity:    1.0 → 0.98
// Adds a subtle violet border glow
borderColor: transparent → primaryLight
borderWidth: 0 → 1.5dp

// Phase: Active dragging
// Dragged item follows finger exactly (translateY: gesture.y)
// No spring during drag — 1:1 tracking

// Other items in the list
// When dragged item passes an item's midpoint:
// That item slides out of the way
translateY: 0 → ±itemHeight   (spring.smooth, direction based on drag)
// Creates the "parting sea" effect — items move aside fluidly

// Phase: Released
// Dragged item snaps to final position
translateY: current → targetPosition   (spring.bouncy)
scale:      1.04 → 1.0                 (spring.bouncy)
shadow:     shadow.3 → shadow.1        (spring.smooth)
background: surfaceElevated → surface  (200ms ease)

// All displaced items snap back to their new positions
translateY: displaced → 0   (spring.smooth)

// Haptic on release
Haptics.notificationAsync(NotificationFeedbackType.Success)

// Haptic as item crosses each position boundary during drag
Haptics.impactAsync(ImpactFeedbackStyle.Light)   // per boundary crossed
```

---

### 8. Edge Swipe — Go Back

Used everywhere a back navigation is possible. Mirrors Android's native back gesture but with our own spring physics.

```javascript
// Gesture: Pan starting from left edge (first 20dp of screen)
// Uses Gesture.Pan with activeOffsetX: [10, Infinity]

// Phase: Active (dragging right)
// Current screen
translateX: 0 → gesture.x   (follows 1:1, no resistance until 0dp)
shadow: adds shadow.3 on left edge as it reveals screen beneath

// Screen underneath (previous screen)
translateX: -screenWidth * 0.3 → Math.max(-screenWidth * 0.3 + gesture.x * 0.3, 0)
// Moves right at 30% the speed of the top screen (parallax)
scale:      0.96 → 1.0   (scales up as top screen moves away)
brightness: 0.85 → 1.0   (darkening overlay fades as top screen moves)

// Phase: Released — committed (translateX > screenWidth * 0.4 OR velocity > 500)
// Top screen exits
translateX: current → screenWidth   (spring.snappy)
// Previous screen settles
translateX: current → 0             (spring.smooth)
scale:      current → 1.0           (spring.smooth)

// Phase: Released — cancelled
// Top screen returns
translateX: current → 0             (spring.smooth)
// Previous screen returns to resting
translateX: current → -screenWidth * 0.3   (spring.smooth)
scale:      current → 0.96                 (spring.smooth)
```

---

### Gesture Conflict Resolution

When multiple gestures could activate simultaneously, Gesture Handler resolves conflicts using this priority order:

```
Priority 1 (highest): Edge swipe — always wins, it's navigation
Priority 2:           Swipe left / right on list items
Priority 3:           Long press — activates after scroll intent is ruled out
Priority 4:           Double tap — only active when not in scroll momentum
Priority 5 (lowest):  Scroll — yields to all other gestures
```

**Simultaneous gestures allowed:**
- Pinch + Pan on charts (user zooms and pans at the same time)
- Scroll + Pull to refresh (overscroll triggers refresh)

**Exclusive gestures (only one at a time):**
- Swipe left/right and scroll are mutually exclusive — determined by initial movement direction within the first 8dp of movement
- Long press and scroll are mutually exclusive — scroll intent cancels long press

---

## Component States

Every interactive component must have all 5 states defined. No exceptions.

| State | Visual Treatment |
|---|---|
| **Default** | Base design as specified |
| **Hover** (for future tablet support) | `primaryLight` tint, shadow.2 |
| **Pressed** | Scale 0.96, `primaryDark` background |
| **Focused** | `borderFocus` ring, 2dp width |
| **Disabled** | 40% opacity, no shadow, cursor not-allowed |
| **Loading** | Skeleton or spinner inside component, disabled interaction |
| **Error** | `danger` border + `dangerMuted` background + error message below |
| **Success** | `success` border flash → reverts to default after 1.5s |

---

> *Design System maintained as part of project planning. All animation values are starting points — adjust during implementation based on feel. Trust the physics, not the numbers.*
