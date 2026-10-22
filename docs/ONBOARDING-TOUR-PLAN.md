# Onboarding and tour redesign: implementation plan

Based on `reports/Onboarding and tour UX for Dime.md` (research, October 2026). Goal: a short, modern first run that gets the user
to a real first expense in session one, with motion and celebration moments that are earned, smooth on budget phones and
fully accessible.

**Success metric:** share of new users who log 3+ transactions within 48 hours of sign-up (activation), plus D7/D30 days with a
logged transaction. Measured with a SQL query on D1, so no analytics SDK is needed. Take a baseline before Phase 1 ships.

---

## Today vs target

| Area | Today | Target |
|---|---|---|
| Before sign-in | 5 illustration slides (WelcomeTour), then the Auth screen | **One Welcome screen**: value line, 3 trust lines, a short animated sample entry, Continue with Google |
| Permissions | Notifications, camera and mic asked **together on Home** right after sign-in (`useHomeNativePermissionsPrompt`) | **Each asked when first needed**: mic on first voice, camera on first scan, notifications on first budget alert or reminder |
| Tour | 10 "Next" steps (welcome, month card, +, FAB menu, Ask AI, day add, recurring, insights, settings, finale), confetti only at the end | **4 action steps** ending in a real first expense; spotlight glides between targets; small celebrations on real actions; one big confetti on the first expense |
| Everything else | Taught inside the tour | **"Get started" checklist** on Home, **one-time tips** on first visit, **teaching empty states** |
| Reduced motion | Partly respected | Full path: no particles, static check plus haptic, cross-fades, live setting listener, **Celebrations toggle** in Settings |
| Video | None | Dropped: the code-drawn Welcome reel shows voice, scan and Ask AI instead |

---

## Phase 1: new first run and an animated tour (JavaScript only, can ship as an OTA update to 1.5.0)

### 1.1 One Welcome screen (replaces the 5 slides)
- **Remove** the `WelcomeTour` route and `WelcomeTourScreen`. Drop `welcomeTourStore`, the 5 slide WebPs and `AuthFeatureCarousel`. Users who are not signed in land on the Auth screen directly.
- **Rework `AuthScreen`** into the Welcome screen:
  - Headline "Know where every rupee goes" and a one-line subhead.
  - **Two trust lines** with icons: "No bank login needed", "Your data is never sold" (no SMS claim, per decision 2).
  - **Hero animation** drawn in code (Reanimated + Skia, about 3 s, then holds): a sample UPI entry ("₹120 · Chai") slides into a mini list, the month total counts up and a category chip pops in. It follows dark mode and weighs nothing. Under reduced motion it shows a static final frame.
  - "Continue with Google" stays the only main action. Legal links stay small at the bottom.
- **Files:** `screens/auth/AuthScreen.tsx` and its model, a new `features/onboarding/components/WelcomeHero.tsx`, and `navigation/RootNavigator.tsx`.
- **Done when:** a cold start while signed out shows one screen; a cold start while signed in skips straight to Home; the screen works in both gesture and three-button navigation, in light and dark mode.

### 1.2 Contextual permissions (stop asking everything on Home)
- **Remove** the bulk prompt (`useHomeNativePermissionsPrompt`, `requestAllAppPermissionsSequentially` and the pending flag set after Google sign-in).
- **Camera and mic** are already requested in context by scan and voice. Add a **one-line reason** before the system dialog the first time ("Dime needs the mic to hear your expense"), and keep the existing "blocked" handling.
- **Notifications** are asked at the **first moment they help**: turning on budget alerts, saving the first budget, adding the first recurring item, or enabling the daily reminder. Each gets a short reason first.
- After a denial, show an inline "Reminders are off · Turn on" row in Settings. Never nag.
- **Done when:** a fresh install sees no permission dialog until the related feature is used; Android 13+ notification denial is handled (two denials count as permanent).

### 1.3 Tour rebuilt as 4 action steps

| # | Step | User does | Ends when |
|---|---|---|---|
| 0 | Start card (centered): "Let's log your first expense, about 20 seconds" · Start / Not now | Taps Start | Start |
| 1 | **Spotlight on +**: "Tap + to add something you spent today" | Taps the real + | The FAB menu opens |
| 2 | **Spotlight on the pencil (manual add)**: "Add it by hand" (the camera and mic bubbles are mentioned in a hint line) | Opens manual add and saves a real expense. The amount field is focused, payee chips and brand search help, and nothing is pre-saved | **Transaction saved**, which fires the **big celebration** |
| 3 | **Spotlight on the new row / today's total** back on Home: "Done! Your month total and budget update instantly" | Taps Got it | Next |
| 4 | **Finish card**: "You're set. Finish setting up anytime" plus a preview of the checklist (2 of 6 ticked) | Taps Finish | Finish |

- **Removed tour steps** move to the checklist or tips: month card, Ask AI, day add, recurring, insights, settings.
- **Not now / Skip** on every step except the last. Skipping marks the tour as seen, and the checklist still appears.
- **Replay:** "Replay tour" in Settings (already exists via `replayAppTour`) and from the checklist. Replays **don't** fire the big confetti.
- **Mid-tour safety:** if the user leaves manual add without saving, the tour returns to step 1 with "No worries, tap + whenever you're ready" (a step can fail, the tour never gets stuck).
- **Files:** `features/appTour/constants/tourSteps.ts` (new step list and an `advanceOn: "transactionSaved"` trigger), `appTourStore.ts` (a step-advance event from the transaction-saved path), `tourNavigation.ts`, and tests in `constants/__tests__` and `store/__tests__`.

### 1.4 Motion: a spotlight that glides, a card that springs
- **Spotlight morph:** animate the hole's x, y, width, height and radius with Reanimated springs (about 300–400 ms, no overshoot past the target). The Skia path is rebuilt on the UI thread with `useDerivedValue` (no React re-render per frame). Add a soft feathered edge (Skia blur mask on the hole) and a gentle **pulse ring** around the target (scale 1 → 1.06, 1.2 s loop, stops once the user interacts).
- **Card choreography:** the card waits until the spotlight settles, then springs in from the target's side (200 ms fade plus 8–12 dp slide). The title appears first, then the body (60 ms stagger). On a step change the card fades out (120 ms) before the hole moves.
- **Sparkle trail** (the owner asked for this): as the hole travels between targets, 6–10 tiny Skia sparkles follow its path and fade out within about 500 ms.
- **Progress:** a "Step 2 of 4" label plus a segmented bar that fills with a spring, replacing the dots. A light tick haptic on each step.
- **Files:** `TourScrim.tsx` (animated hole), `AppTourOverlay.tsx`, `TourCard.tsx`, `TourProgressDots.tsx` (becomes `TourProgressBar.tsx`), `utils/tourMotion.ts` (one place for durations and springs, including reduced-motion values).

### 1.5 Celebrations (confetti-like effects during the tour, not only at the end)
- **One app-wide `CelebrationLayer`** (Skia canvas, `pointerEvents="none"`, mounted once at the app root) with a small store API:
  `celebrate({ kind: "confetti" | "burst" | "sparkles", at?: { x, y } })`.
  It reuses and extends `TourConfetti.tsx` and `confettiParticles.ts`; no new library. Particle count is capped (about 120 for confetti, about 24 for a burst), and particles are drawn as `Atlas`/points so one Skia pass does all of them.
- **When it fires:**

| Moment | Effect | Haptic |
|---|---|---|
| Tour step 2: first real expense saved | **Big confetti**, full screen, 1.5–2.5 s, non-blocking, brand colours plus ₹ coin shapes | Confirm |
| Tour step 1: + tapped and the FAB fans out | **Burst** of coins/sparkles from the + button (600–900 ms) | Tick |
| Moving between tour targets | **Sparkle trail** (see 1.4) | none |
| Tour finished | **Check mark draws in** on the finish card (no second confetti) | Confirm |
| Later (Phase 2): each checklist item done the first time | **Burst** at the item plus a check draw | Confirm |

- **Rules:** celebrations mark something the user did, never a plain "Next" tap and never spending as such (the first-expense confetti celebrates "you started tracking", and the copy says so). No celebration on a replayed tour. At most one big confetti per day.
- **Settings:** a new **"Celebrations"** toggle (Settings → Appearance or Haptics; on by default). Off means no particles, only a check mark and a haptic.
- **Haptics:** move the celebration haptics to Android `performAndroidHapticsAsync` Confirm and Tick (works on the phone's haptics engine, no permission needed), and respect the existing haptics setting.
- **Files:** a new `components/celebrations/CelebrationLayer.tsx`, `stores/celebrationStore.ts`, `lib/celebrations/particles.ts`, a Settings toggle row, and a preference in device MMKV.

### 1.6 Reduced motion and accessibility
- **Reduced motion** (Android "Remove animations", read live via the existing `useReduceMotion` hook, not just at app start):
  - no particles, no sparkle trail, no pulse ring;
  - the spotlight **cross-fades** to the next target instead of moving;
  - the big confetti is replaced by a **static check illustration** plus a haptic;
  - the Welcome hero shows its final frame.
- **TalkBack:** move focus to the card on each step and announce "Step 2 of 4, Tap + to add…" (already partly done). Hide the dimmed layer from accessibility, and give every action step a visible button alternative so it can be finished without hunting for the target.
- **Layout:** the card flips above or below the target and respects the status bar and navigation bar insets (the three-button-nav lessons from 1.5.0).
- **Done when:** the tour can be completed with TalkBack on, with "Remove animations" on, and in three-button navigation.

### 1.7 Raw screen recordings for the Phase 3 clips (owner does this; see decision 3)
- Capture on the emulator with `adb shell screenrecord` (portrait, 720×1600, about 8–12 s each, no audio):
  1. **Voice add:** tap mic → speak → "Reading…" → transaction appears.
  2. **Receipt scan:** tap camera → capture → upload → parsed transaction.
  3. **Ask AI:** open the agent → tap a suggestion → answer with a chart.
- Use a demo account with realistic data and real parsing. The clips need parsing to show results: either a valid DeepSeek key locally, or record against production with a demo account (you'd okay that first).
- Deliver them to `assets-src/onboarding-recordings/` (not bundled) for you to edit in Canva.

### Phase 1 testing
- **Unit (Jest):**
  - new tour step machine (advance on the transaction-saved event, skip, replay, failure path back to step 1)
  - celebration store (frequency cap, no celebration on replay, Celebrations toggle off, reduced motion)
  - permission gating (no prompt on launch)
- **Emulator, release build:**
  - fresh install → Welcome → Google sign-in (you test this part) → tour
  - first expense → confetti
  - finish card, then replay from Settings (no confetti on replay)
- **Matrix:** gesture navigation and three-button navigation; light and dark mode; Remove animations on and off; TalkBack quick pass; a low-spec emulator profile (2 GB RAM) to check the particle frame rate.
- **Review:** one review pass over the whole batch diff, then fixes.

**Ships as:** an OTA update to 1.5.0 (no native changes in Phase 1). The usual typecheck, lint and tests run before publishing.

---

## Phase 2: learning after the tour (JavaScript only, OTA)

### 2.1 Home "Get started" checklist
- A dismissible card on Home: **"Get started · 2 of 6"**, with items ticked by real actions (computed from data, so it works across reinstalls):
  1. Log your first expense ✓ (from the tour)
  2. Try voice or scan
  3. Set a monthly budget
  4. Add a recurring bill or income
  5. Add the home-screen widget
  6. Ask Dime AI a question
- Tapping an item opens that feature. The first completion of each item fires a **burst plus a check**. When all are done, a small celebration plays and the card retires.
- A "Replay the tour" link sits at the bottom of the card.

### 2.2 One-time contextual tips
- A small tip bubble the **first time** a screen or feature is opened: voice sheet, scan, budgets, recurring, insights, Ask AI, the widget card. Each shows once, can be dismissed, and is stored per device.
- One shared `FirstUseTip` component with the same motion tokens as the tour. These replace the removed tour steps.

### 2.3 Teaching empty states
- **Home, no transactions:** "Tap + or just say it", with the mic shortcut.
- **Insights, no data:** a ghosted sample chart labelled "Your chart appears after a few expenses".
- **Budgets, no budget:** "Set a monthly budget" with a suggested amount (from 2.4 if answered).

### 2.4 One or two goal questions (folded into ProfileSetup)
- After the name, ask "What do you want from Dime?" with 3 chips: Track spending / Stick to a budget / Save for something, plus an optional monthly budget amount.
- The answer visibly changes what comes next (for example, Budget pre-fills the budget card and puts "Set a budget" first in the checklist).
- Skippable. Judge it on activation and D7, not on how many people complete it.

**Ships as:** an OTA update.

---

### Phase 2 decisions (agreed)
1. **Checklist audience:** accounts created after Phase 2 ships, plus anyone who hasn't finished it; existing users with everything done never see it. The API returns the account's creation date; the app compares it with a fixed cutoff.
2. **Widget item:** kept, with a short how-to (Android can't add a widget for the user without the system prompt).
3. **Goal question:** one extra skippable screen in profile setup; stored per user on the device.
4. Progress for items 1–4 and 6 comes from a new `GET /api/v1/me/onboarding-progress` (one query, works across devices); the widget item uses a device flag set by the widget task handler.

## Phase 3: feature clips (dropped, 2026-10-20)

**Dropped by the owner.** The Welcome feature reel (shipped in PR #38) already shows voice, scan and Ask AI, so clips in the
first-use tips would repeat it at the cost of a native build, recordings, R2 hosting and an `expo-video` caching risk. If the tips
ever need motion, reuse the reel scenes in `FirstUseTip`'s `media` prop (JavaScript only, OTA). The original plan is kept below for
reference; the 1.7 recordings are no longer needed.

- **Content:** you edit the three Phase 1.7 recordings in Canva into **4–10 s silent loops**: portrait (9:16 or the phone's shape), H.264 MP4, no audio track, about 0.3–1 MB each. Captions stay out of the video; the app draws them so they can be translated and read by screen readers.
- **Hosting:** upload to R2 (served through the Worker, which caches them) under a versioned path, so a clip can be replaced without an app release.
- **App:**
  - **Player:** add `expo-video` (native), with a `FeatureClip` component: autoplay muted loop, `useCaching: true`, and a **bundled poster still** until it plays.
  - **When it shows the poster only:** reduced motion, Data Saver or a metered connection (via the netinfo "expensive" flag), or a failed load.
  - **Where it appears:** the first-use tips for voice, scan and Ask AI (2.2).
- **Testing:** real-device test (expo-video has an open caching bug report), first load on a slow network, and offline behaviour (poster only).
- **Release:** version bump to 1.6.0 (versionCode 7), APK saved to `release/`.

---

## Phase 5: tours for each tab (done, 2026-10-21: PR #40, OTA `5c4092a1`)

**As built** (differences from the plan below): finishing a tour gets **confetti** (the owner asked for effects throughout, not
only a check), a Do step gets a coin burst, ripple and a "Nice!" badge, and the Ask AI chat header has its own "?". Seven tours in
all: firstExpense (unchanged, auto-start), home, transactions, budgets, insights, askAi, addMenu. Sample data shows only when the
whole account has no transactions, so a screen is all sample or all real. Details and gotchas: `docs/HANDOVER-ONBOARDING.md`.


On-demand, short, interactive tours of one tab at a time, including the screens behind it. The first-expense tour (Phase 1)
stays as the onboarding moment; its finish card points to "?".

- **Entry points:**
  - a small **"?" button** floating above the Ask AI button on each tab, with a dot, shown until that tab's tour has been watched
    (or skipped), then it goes away;
  - a **"?" in each tab's header**, always there, for replays;
  - **Settings → Tours**: one row per tab with a ✓ once seen, the length ("~25 s") and Play.
- **Tours** (4–7 stops each, roughly 20–30 s): Home, Transactions, Budgets, Insights, Ask AI, plus the + menu (manual, voice, scan).
  Tours walk into sub-screens (for example Transactions: calendar → day card → transaction detail → edit → back); the engine
  navigates and scrolls each target into view.
- **Interaction:** "Do" steps for safe actions (tap a day, open a transaction, switch month), which wait for the real tap;
  "Watch" steps with Next for everything else. A tour never saves, edits or deletes anything. Skip and Step N of M on every stop;
  leaving mid-tour saves nothing.
- **Sample data:** restored from the removed `features/tourPreview` (commits c364452, 808cb4b): only for screens that are empty,
  a "Sample data" banner while it shows, read-only (edit and delete disabled on sample rows; steps that would need a save become
  Watch steps), never written to the query cache. The sample month reuses the Welcome reel's October story (`reelStory.ts`).
  Ask AI uses a scripted sample answer, never a real model call.
- **Motion:** the Phase 1 tour engine and tokens (spotlight morph, card choreography, progress bar, reduced-motion path); a ✓
  check on finishing (as built: plus confetti, see above).
- **First-use tip cards retired** (voice, budgets, recurring, insights, Ask AI, the first-scan toast text); "?" replaces them.
  The checklist's "Replay the tour" becomes "Take a tour".
- Seen state per user on the device (MMKV).

## Phase 4: later (each its own decision)

- **Forgiving weekly logging streak** with freeze days; milestone celebrations only, no loss-framed notifications.
  *Built but parked (2026-10-21), not merged:* the worktree `.claude/worktrees/agent-a675b386fcbda97a4` (branch
  `worktree-agent-a675b386fcbda97a4`, uncommitted) has `GET /api/v1/me/streak`, a Home streak chip with milestone bursts and
  `api/scripts/metrics/activation.sql`. The owner wants to revisit the design before it ships.
- **Try before sign-in:** log one expense locally, then sign in to save it (needs local-first storage and a merge on sign-in). Run it as an A/B test.

---

## Order, effort and how each ships

| Phase | Items | Effort | Ships as |
|---|---|---|---|
| 1 | Welcome screen, contextual permissions, 4-step tour, spotlight motion, celebrations, reduced motion and accessibility, raw recordings | 1 large batch | OTA update to 1.5.0 |
| 2 | Checklist, first-use tips, empty states, goal question | 1 medium batch | OTA update |
| 3 | ~~Feature clips with expo-video~~ dropped (the Welcome reel covers it) | — | — |
| 4 | Streaks, try-before-sign-in | later | Decide later (streak built, parked) |
| 5 | Tours for each tab, sample data, "?" entry points, Settings → Tours, tip cards retired | 1 large batch | OTA (done, #40) |

Each batch follows the project rule: explore, then implement in one pass, then test once at the end, then one review pass. No commits
without your OK; when a batch is done I raise a PR.

## Decisions (agreed)
1. **First-expense step:** the user logs a **real** expense; nothing is pre-saved.
2. **Trust lines:** no "We never read your SMS" line; keep "No bank login needed" and "Your data is never sold".
3. **Recordings for the clips:** the owner records and tests these; 1.7 is out of Claude's Phase 1 scope.
