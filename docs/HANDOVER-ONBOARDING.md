# Handover: onboarding and tour work (phases 1–6)

For a new chat picking this up. Repo `C:\Dime` (`api/` Hono on Cloudflare Workers + D1, `frontend/` Expo SDK 54 / RN 0.81 / React 19 /
Reanimated 4 / Skia 2 / React Compiler). Read `CLAUDE.md`, `AGENTS.md`, `docs/RELEASE.md` and `docs/ONBOARDING-TOUR-PLAN.md` first.
Research behind the design: `reports/Onboarding and tour UX for Dime.md` (local, not in git).

## Where things stand (2026-10-21)

| Phase | What | Status | PR | Shipped as |
|---|---|---|---|---|
| 1 | Welcome screen, contextual permissions, 4-step action tour, celebrations | Done | [#36](https://github.com/amrith-git-01/dime/pull/36) | OTA `bccf5732` |
| 2 | Get started checklist, first-use tips, teaching empty states, goal step | Done | [#37](https://github.com/amrith-git-01/dime/pull/37) | API deploy + migration 0009, OTA `df0a867c` |
| 3 | Welcome feature reel (6 looping code-drawn scenes) | Done | [#38](https://github.com/amrith-git-01/dime/pull/38) | OTA `fa4b3000` |
| 3b | Welcome layout, one-story reel, progress jitter fix, empty-day Add | Done | [#39](https://github.com/amrith-git-01/dime/pull/39) | OTA `9a259e5c` |
| 4 | Feature clips (voice, scan, Ask AI) in first-use tips | **Dropped** (the reel covers it) | — | — |
| 5 | Habit layer: weekly streak + activation metrics (try before sign-in out of scope) | **Built, parked** (owner to revisit) | — | not merged |
| 6 | Tours for each tab, sample data, "?" buttons, Settings → Tours, tip cards retired, Ask AI "D" icon | Done | [#40](https://github.com/amrith-git-01/dime/pull/40) | OTA `5c4092a1` |
| — | Deep links return to the existing tabs (`pop: true`) | Done | [#41](https://github.com/amrith-git-01/dime/pull/41) | OTA `af2f0652` |

The plan doc numbers differ: its "Phase 5" is the tours and its "Phase 4" the streak.

- App version **1.5.0** (versionCode 6); `release/dime-1.5.0.apk` is the installed build. Everything above reached it by OTA.
- Activation baseline taken before Phase 2: 1 of 4 accounts logged 3+ transactions in their first 48 h (too few users to compare yet).
- Owner's account: `selvarajamrith958@gmail.com` (user id `80e6786d-b171-4aba-b563-533c96df52d1`).

---

## Phase 1 — first run and the tour (done)

**Welcome (before sign-in):** the 5 intro slides are gone. `src/screens/auth/AuthScreen.tsx` is the only signed-out screen: wordmark,
"Know where every rupee goes", subhead, two trust lines (`WelcomeTrustLines.tsx`: "No bank login needed", "Your data is never sold";
the owner chose **no SMS claim**), the hero (replaced by the Phase 3 reel), Continue with Google.

**Permissions:** the bulk prompt after sign-in is removed.
- Camera and mic: a one-line reason before the first system dialog (`features/onboarding/utils/permissionReasonAlert.ts`).
- Notifications: `askNotificationsInContext(reason, queryClient)` after the first monthly budget, category budget or recurring item
  save; once per device; skipped when the in-app Notifications switch is off.
- `lib/appBootstrap.ts` push sync is check-only (`syncExpoPushTokenForUser(..., { requestPermission: false })`).

**Tour** (`src/features/appTour/`): steps `welcome → addFab → fabManual → homeRecent → finale`.
- `addFab` advances when the + menu opens; `fabManual` advances on `appTourStore.onTransactionSaved()` (called from
  `useSubmitManualTransactionMutation` onSuccess) after a **real** expense is saved; leaving the form without saving
  (`beforeRemove` in `useManualAddScreenLifecycle.ts`) calls `onManualAddAbandoned()` → back to `addFab` with retry copy.
- `homeRecent` spotlights the **month card** (`tourTargetIds.homeMonthCard`), not the Recent list (it is below the fold).
- `startedFrom: "auto" | "replay"`; replay from Settings and from the checklist; no celebrations on replay.
- Motion: spring hole morph, pulse ring, sparkle trail (`TourSparkleTrail`), card enters after the hole settles, `TourProgressBar`
  ("Step N of 3"), tick haptic per step; tokens in `utils/tourMotion.ts`.

**Celebrations:** app-wide `components/celebrations/CelebrationLayer.tsx` + `stores/celebrationStore.ts`
(`celebrate({ kind: "confetti" | "burst", at?, haptic? })`), particles in `lib/celebrations/particles.ts`.
- Coin burst when the + opens, big confetti on the first real expense, check-mark draw on the finale.
- Rules: never on replay; big confetti at most once per local day; static check under reduced motion or with the
  **Celebrations** toggle off (Settings → Haptics, device MMKV `preferences.celebrations_enabled`).
- Haptics helpers `triggerConfirmHaptic` / `triggerTickHaptic` respect the haptics preference.

## Phase 2 — learning after the tour (done)

**API:** `GET /api/v1/me/onboarding-progress` → `{ first_expense, voice_or_scan, budget, recurring, asked_ai }`, one SQL
(`api/src/features/onboarding/`). First expense = live debit with no `recurring_item_id`; budget = monthly > 0 or any category budget;
recurring = any item (paused ones count); asked_ai = `users.first_agent_question_at` (migration **0009**, set with COALESCE after a
successful agent turn in JSON and SSE paths, backfilled from `agent_usage`).

**Get started checklist** (`features/onboarding/components/GetStartedCard.tsx`, `hooks/useGetStartedChecklist.ts`, pure logic in
`utils/checklist.ts`): below the month card on Home; 6 items (first expense, voice or scan, budget, recurring, widget, Ask AI).
- Visible when not all done, not hidden, tour not active and tour seen/skipped (read via `useSyncExternalStore` — a plain call was
  memoised by the React Compiler and the card never appeared; fixed on device).
- First render records what is already done silently; later transitions celebrate once each (burst + check draw); all done →
  "You're a Dime pro" for 4 s, then retired permanently. Per-user state in device MMKV (`lib/onboarding/checklistStorage.ts`).
- Widget item: device flag set on `WIDGET_ADDED` in `widgets/widgetTaskHandler.tsx` plus a `getWidgetInfo` check on focus; how-to modal
  does not tick it. The flag is per device, not per user.
- Progress query invalidated by the transaction, recurring and budget cache helpers and the agent chat final event; never persisted.

**First-use tips** (`features/onboarding/components/FirstUseTip.tsx`, once per device, hidden while the tour runs, `media` prop reserved
for Phase 4): voice sheet, Budgets, Recurring, Insights (copy says "use the arrows" — the screen has no swipe), Ask AI ("Try it"),
first receipt upload (rides on the success toast).

**Empty states:** Home Recent "Tap + or just say it" + Say it; Insights ghost chart (`InsightsEmptyChartCard`); Budgets "Set ₹X as your
monthly budget" from the goal amount.

**Goal step** in ProfileSetup (`features/profile/components/bento/ProfileGoalStep.tsx`): Track spending / Stick to a budget (+ optional
amount) / Save for something; runs **before** the profile PUT (the PUT switches the root route to Main); budget upserted through the
API function directly (not the mutation hook, to avoid the notification prompt during setup). Goal stored per user in device MMKV.

**Removed:** `features/tourPreview` (sample-data preview) and `usePreviewable` from 7 hooks.

## Phase 3 — Welcome feature reel (done)

`src/features/onboarding/components/reel/`: `FeatureReel` replaces the old one-shot hero on `AuthScreen`.
- Six scenes in `scenes/` (QuickAdd, Voice, Receipt, Budget, Insights, AskAi), ~3.5 s each, crossfade, endless loop; captions
  "Add it in seconds", "Just say it", "Snap the receipt", "Know what's left", "See where it went", "Ask anything".
- Story-style segments (tap to jump), swipe, hold to pause; pauses in background, unfocused, during sign-in, when hidden for lack of
  room, with a screen reader on, and under reduced motion (final frames, manual swipe only).
- Clock advanced on the UI thread by a frame callback that is `setActive(false)` whenever paused; JS never reads shared values (a JS
  read raced a queued write in Reanimated 4.1 and froze the reel on device). State machine with generation ids in `reelMachine.ts`.
- Built only from existing theme tokens and component styles (owner requirement: do not deviate from the design system).

**Polish (PR #39):**
- Welcome screen on one left edge: headline 32/38 with `textBreakStrategy="balanced"`, smaller wordmark, progress bar above a
  full-width card (hairline border), caption 17 semibold below it, trust lines as one wrapping row under the Google button.
- Scene order Voice → Receipt → Quick add → Budget → Insights → Ask AI (`REEL_SCENES`; components keyed by scene id).
- One October story shared by every scene in `reel/reelStory.ts` (Swiggy, Smoor, Rapido, Zepto, Chai; total ₹18,620, budget
  ₹30,000, recurring ₹2,400, food ₹7,076). The tour sample month reuses it.
- Progress jitter fixed: a new segment's fill mounted before the clock reset. `LiveFill` is gated on `sceneGen === activeGen`
  (`activeGen` in `reelMachine.ts`), and the leaving segment shows full while exiting.
- Transactions: an empty day has no Add in the date header (the empty card already has "Add expense").

---

## Phase 4 — feature clips (dropped, 2026-10-20)

The owner dropped this: the Welcome reel already shows voice, scan and Ask AI, so recorded clips in the first-use tips would repeat
it at the cost of a native build (`expo-video`, 1.6.0), Canva editing, R2 hosting and a known caching bug. If the tips ever need
motion, reuse the reel scenes in `FirstUseTip`'s `media` prop (JavaScript only, OTA). No recordings are needed.

## Phase 5 — habit layer (built, parked: the owner wants to revisit it)

Lives only in the worktree `C:\Dime\.claude\worktrees\agent-a675b386fcbda97a4` (branch `worktree-agent-a675b386fcbda97a4`,
**uncommitted**, never merged). Its `node_modules` are junctions into the main checkout: remove them with `rmdir` before deleting the
worktree, never `rm -rf` through them.
- **Streak:** `GET /api/v1/me/streak?timezone=` (`api/src/features/streak/`). Monday–Sunday weeks on the local date; a week is kept
  with 3+ logged days (not deleted, `recurring_item_id IS NULL`); every 4 kept weeks earns a freeze (max 2); a missed week spends one
  (bridges, adds nothing); the current week never breaks the streak. One SQL query over 104 weeks, no migration. Home `StreakChip`
  under the month card, rules sheet on tap, milestone bursts at 4/8/12/26/52 once per account (device MMKV).
- **Metrics:** `api/scripts/metrics/activation.sql` (3+ transactions in 48 h, D7/D30 logged days per sign-up week). Run with
  `npx wrangler d1 execute DB --remote --file scripts/metrics/activation.sql` (read-only). Not yet run on production.
- Open questions: whether frozen weeks count, whether milestones repeat after a break, whether SMS/notification captures count as
  "logged", chip placement and copy.
- **Try before sign-in:** out of scope for now (needs local-first storage; an A/B test means nothing with this few users).

Original notes:

- **Forgiving weekly logging streak** with freeze days; celebrate milestones only, randomly and optionally; no loss-framed pushes
  (research: streaks help retention but drive FOMO; Robinhood's confetti settlement — never celebrate spending).
- **Try before sign-in:** log one expense locally, then sign in to save it; needs local-first storage and a merge on sign-in. Run as
  an A/B test.
- Measure the redesign: share of new users with 3+ transactions in 48 h, D7/D30 days with a logged transaction (SQL on D1).

## Phase 6 — tours for each tab (done, PR #40)

Engine in `src/features/appTour/` (non-UI API in `index.ts`, UI in `components/`), helpers in `src/lib/tour/`:
- **Registry** `constants/tourRegistry.ts`: `firstExpense` (`firstExpenseTour.ts`, behaviour unchanged), `home`, `transactions`,
  `budgets`, `insights` (`tabTours.ts`), `askAi`, `addMenu` (`featureTours.ts`). Steps have `kind` (welcome/watch/do/finale),
  `screen`, `targetId`, `advanceOn` (event name), `action` ("do it for me"), `optional`, `scrollKey`/`revealVia` and `icon`.
- **Store** `store/appTourStore.ts`: `start(tourId, startedFrom)`, `next/back/skip/finish`, `onEvent`. The completion is computed once
  per `runId`; an account change ends the tour through the same path (runs `cleanup`). Seen state per user per tour in MMKV
  (`app_tour.tab.v1:<tourId>:<userId>`; Tour master `app_tour.master.v1:<userId>`). `launchTour` suppresses the first-run auto-start
  for the session.
- **Screens talk to the tour** through `emitTourEvent` (`lib/tour/tourEvents.ts`) in real tap handlers, `useTourCommand` (the "do it
  for me" buttons), `useTourScroller` (scroll registry + `tourReveal`; targets within 120 dp of the tab bar count as hidden) and
  `useTourRestorable` (month/day put back when the tour ends). `popTourScreens` closes the screens the tour pushed.
- **Pause rule** `hooks/useTourPaused.ts`: a tour shows only on screens it owns; voice/receipt capture always pause it; the agent chat
  pauses every tour except askAi. `notifyTourTabFocused` (wired as `screenListeners.focus` in `MainTabNavigator`) is required: the
  container "state" event does not fire when the tab navigator first mounts, so the cold-start Home was invisible to the tour.
- **Navigation:** always `navigate("Main", { screen: "MainTabs", params, pop: true })`. Without `pop`, React Navigation 7 pushes a
  second tab navigator (slow, every tab's state lost). Deep links got the same fix in #41.
- **Entry points:** `TourHelpFab` (floating "?" above the Ask AI button with a dot and pulse; folds away once that tab's tour is
  seen; hidden during tours), a "?" in `AppHeader` and `AgentChatHeader`, Settings → Tours (`SettingsToursScreen`,
  `SettingsToursEditor`, `SettingsNavRow` trailing slot, Tour master badge). Get started's link is "Take a tour". The Ask AI FAB hides
  while any other tour runs (its Android elevation drew it over the scrim).
- **Sample data** `src/features/tourPreview/`: `usePreviewable` on the home, summary, category, list, range, budget, category-budget,
  recurring and insights hooks. Shown only during a non-firstExpense tour, not paused, when the account was latched empty at tour
  start; never written to the QueryClient. Sample ids start `5a3b1e00-` and every save, delete and refetch path guards them. The
  "Sample data" pill sits below native headers on stack screens. Ask AI tour: a scripted exchange
  (`agent/utils/scriptedTourChat.ts`) that never calls the model or counts usage; the real chat is stashed and restored.
- **Effects:** spotlight morph and sparkle trail, Do-step glow, ripple, zoom-through between screens, coin burst and "Nice!",
  word-by-word titles, progress sparkles and halfway shimmer, confetti on finish (`confettiMedium` does not use the daily cap; the
  first finish is big; the last unseen tour is big and ignores the cap). All respect Celebrations, haptics and reduced motion.
  **Exactly two Skia canvases per tour run** (scrim + celebration layer, each created once): more canvases caused ANRs
  (`eglCreateWindowSurface` on the UI thread). `components/__tests__/skiaSurfaces.test.ts` fails if more appear. The celebration
  canvas is primed only when particles can play.
- **Retired:** `FirstUseTip`, `firstUseTipStorage`, `scanTip` (guard test `tipCardsRetired.test.ts`).
- **Agent icon:** `src/components/brand/DimeMark.tsx` (a vector traced from the app icon) replaces the sparkle.
- **Known minor:** with sample data the Insights cash-flow chart and the month-compare snapshot show no sample bars, and the optional
  "Side by side" step can be skipped; the first card can take ~3 s while sample data switches on (emulator); TalkBack not yet tested.

---

## Other open items (outside these phases)

- **Widget quick-add "Paid to" empty:** saves the category name as the payee ("Health"), which then shows in "Your payees". Agreed
  direction (not built): save as Unknown + hide category-named payees from suggestions. Owner said to revisit with the widget.
- **Brand logos:** deferred (Brandfetch Logo API needs a free client ID).
- **Brand catalogue** (`api/scripts/brands/build.ts`, `manual.json`, migration 0008): 2,171 brands in production. Re-run
  `npm run brands:build` then `wrangler d1 execute DB --remote --file scripts/brands/out/brands.sql` after editing `manual.json`.
- **Automatic expense detection:** researched; recommended notification-listener (Play-allowed with disclosure) + copy-SMS detection +
  Share to Dime for screenshots/PDFs. Not started. SMS permission is not viable (Play policy; Play Protect blocks sideloads in India).
- **Second Claude Desktop instance** (owner's request, not Dime): blocked — the MSIX build 2.42304.2.0 exits immediately with
  `--user-data-dir`; the main profile moved to `%LOCALAPPDATA%\Claude-Data\claude_pzs8sxrjxfjjc`; old Instance2 profile is virtualised at
  `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude-Instance2`; engine 2.1.299 was copied to
  `%APPDATA%\Claude-Instance2\claude-code\2.1.299`. Next: find how this build selects its profile directory.
- Earlier: Google sign-in on a release APK and real receipt/voice parsing still need the owner; `CLAUDE.md` Status section is stale.

## How to work on this repo (gotchas learned)

- **Owner's rules:** build each batch fully, then test once; Explore (Haiku) → Implement (Sonnet) → Review (Opus) subagents per batch;
  no commits/pushes unless asked (PRs are fine once the owner asks); every native release bumps the minor version and keeps all APKs in
  `release/`; ask before writing to production data.
- **OTA:** `cd frontend && npm run publish:update -- --message "..."` from an up-to-date `main` (dry run with `--dry-run`); it targets the
  `version` in `app.json` (runtime policy appVersion). Check the bundle has no `localhost:8787`.
- **`gh` is not logged in:** open PRs via the GitHub REST API with the token from `git credential fill`.
- **Local E2E on the emulator** (`Pixel_6_API_33`, x86_64; adb is `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`, not on
  PATH). Use a **debug build + Metro**; patching `session.ts` to drop `__DEV__` for a release build is blocked by the safety checks.
  - API: `cd api && npx wrangler dev --port 8789 --local`. The emulator reaches it at **`http://10.0.2.2:8789`** (`adb reverse` to a
    127.0.0.1-only wrangler failed because the emulator connects over IPv6).
  - Session: mint a 12 h token with `%TEMP%\mint.mjs` (copy into `api/` as `mint.tmp.mjs`, set the user id,
    `node mint.tmp.mjs .dev.vars`, delete it). Local users: `e2e…0001` (tester, has data), `e2e…0002` (newbie, empty: sample data).
  - Build once: `cd frontend/android && ./gradlew assembleDebug -PreactNativeArchitectures=x86_64`, then `adb install -r` the APK.
  - Metro: `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8789 EXPO_PUBLIC_DEV_SESSION='<json>' NODE_OPTIONS=--max-old-space-size=6144
    CI=1 npx expo start --port 8081 --clear`, plus `adb reverse tcp:8081 tcp:8081`. Fetch the bundle with curl before launching, or
    the app hits the splash safety cap while Metro bundles.
  - **Metro's file watcher stops picking up edits on this machine** (after a worker runs out of memory): restart Metro with `--clear`
    after every round of edits, and check the bundle contains the change.
  - The machine is memory-tight: kill leftover `jest-worker` and old `wrangler`/`workerd` processes, and run Jest with `-w 2`.
  - `adb shell pm clear com.amrith_01.frontend` gives a fresh first run (the dev session is re-read from the env).
  - Don't use `uiautomator dump` while tours animate: it never idles and contributed to ANRs.
  - Disk: the Gradle cache and emulator snapshots were cleared on 2026-10-21, so the next APK build and emulator boot are slow.
  - On Windows Git Bash, set `MSYS_NO_PATHCONV=1` for `adb shell` paths like `/sdcard/...`.
- Verification: `api/` → `npm run typecheck && npm run lint && npm test`; `frontend/` → `npx tsc --noEmit && npm run lint && npm test`.
  Current counts: API 928 (961 in the parked streak worktree), frontend 1136.
