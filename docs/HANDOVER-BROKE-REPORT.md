# Handover: Broke Report (app phase B)

Repo `C:\Dime`. Read `CLAUDE.md`, `docs/BROKE-REPORT-PLAN.md` (the locked decisions and the API contract) and `docs/RELEASE.md` first.
Phase A (API, settings, notification kind) is in the worktree; this is the app: the story player, the copy, the entry points.

## What exists

`frontend/src/features/brokeReport/`

| Part | Where | Notes |
|---|---|---|
| Snapshot types | `types.ts` | Mirror of `api/src/features/reports/schemas.ts` (v1). `slides` and `title.id` are plain strings on purpose: a newer server may send ids this build does not know. |
| Data | `queryKeys.ts`, `api/reportsApi.ts`, `hooks/useReportsList.ts`, `useReport.ts`, `useMarkReportViewed.ts` | `reportQueryKeys`: `['reports']`, `list(userId)`, `period(userId, key)`. `GET /reports/:period` 404 resolves to `null` (a normal "no such report" state). A cached snapshot never goes stale (`REPORT_SNAPSHOT_STALE_MS = Infinity` in `lib/queryDefaults.ts`); a cached `null` is asked again. List + snapshots are persisted for offline (`lib/queryCachePolicy.ts`), a `null` is not. |
| Story engine | `utils/storyLogic.ts`, `utils/storyMachine.ts`, `hooks/useStoryController.ts` | Pure reducer (no wrap-around: next on the last slide stays, previous on the first restarts it), per-slide `durationMs`, a UI-thread clock like the Welcome reel's (JS only writes shared values). Reduced motion or a screen reader = final frames and no auto-advance. |
| Player | `components/StoryPlayer.tsx`, `StoryProgress.tsx`, `ClosingControls.tsx` | Tap right 2/3 next, left 1/3 previous, hold pauses, swipe down closes, tap a segment to jump. The chrome (progress, close, footer) sits above the gesture area so buttons never turn the page. Previous/Next buttons appear for screen readers. |
| Slides | `components/slides/*` | One component per slide. `resolveSlides(snapshot)` decides what plays and in which order (server order, unknown ids dropped, a slide without data is never drawn). |
| Copy | `copy/gentle.ts`, `spicy.ts`, `savage.ts`, `copy/resolve.ts` | One reviewable file per roast level, 3+ variants per slot, picked by a hash of `period_key + slot`, so a report reads the same every time. Changing the level in Settings re-renders old reports. Tone rules are at the top of `copy/types.ts`. |
| Palette | `constants/reportPalette.ts` (exposed as `colors.report` in the theme) | 8 tones, light and dark, AA contrast checked in `theme/__tests__/reportPalette.test.ts`. |
| Share | `utils/shareReport.ts`, `components/ShareCard.tsx`, `utils/shareStats.ts` | Skia `makeImageFromView` on a 360x450 card mounted under the (opaque) slide, PNG to `cacheDirectory` through `expo-file-system/legacy`, then `expo-sharing` (RN `Share` as the fallback). Amounts are off the card by default; the closing slide has the "Show amounts on the card" switch. A null capture shows a toast, never a crash. No `react-native-view-shot`, no new native module. |
| Entry points | `components/ReportBanner.tsx`, `PastReportsShelf.tsx`, `ReportsListEditor.tsx` | See below. |
| Route | `screens/brokeReport/` (`BrokeReportScreen`, `useBrokeReportScreenModel`), `navigation/MainStackNavigator.tsx` | `BrokeReport { periodKey }`, full-screen `transparentModal` + fade like `TransactionDetail`. Handles loading, "This report isn't available" (404), offline and error with retry. `periodKey: 'sample'` renders `__fixtures__/reportFixtures.ts` `SAMPLE_SNAPSHOT` with a SAMPLE badge. |

Entry points: Home banner (above the arrangeable cards in `HomeContent`, not part of Arrange; shows when the newest report is unviewed, is the previous IST month and today IST is day 1 to 7; dismiss is an MMKV flag per user and month in `lib/reports/reportBannerStorage.ts`) · Insights "Past reports" shelf (a fixed sibling above `OrderedCards`, last 6 months, dot on unviewed) · Settings → Broke Reports (`SettingsBrokeReports`, newest first, empty state with "See a sample") · push / inbox action `report` (`lib/notifications/resolvePushAction.ts`, `useNotificationOpenHandler.ts`) · deep link `dime://reports/YYYY-MM` (`lib/deepLinks`, `reportDeepLinkUrl`).

A new report appears without a restart: the foreground push listener and the notifications realtime refresh both invalidate `reportQueryKeys.all`, and so does a long background (`invalidateServerDrivenQueries` in `lib/appBootstrap.ts`).

## Preview on the emulator

1. Open the app, **Settings → Broke Reports → See a sample** (the row is there with or without real reports). The sample is a made-up month with every slide.
2. Roast level: **Settings → Notifications & alerts** (phase A). Reopen the sample to see the other voices.
3. Try: hold to pause, tap the left and right of the screen, swipe down, tap a progress segment, turn on TalkBack / "Remove animations" (final frames, Previous/Next buttons, no auto-advance), Share on the last slide (with and without "Show amounts").
4. Real reports need data: from the API (`wrangler dev`, migrated), `POST /api/v1/internal/reports/run` with `X-Email-Cron-Secret` and optional `{ "period_key": "YYYY-MM" }` builds the previous (or the given finished) month for users with 5+ debits. The reply is `{ period_key, selected, queued, failed }`; it is safe to repeat.

Deep link test: `adb shell am start -a android.intent.action.VIEW -d "dime://reports/2026-10"`.

## How the API side works (from the plan)

- Snapshots are built only by the cron / queue path: the daily 02:30 UTC cron fans out on IST days 1 to 3 for the previous month, one `{ type: 'report', user_id, period_key }` queue message per user with 5+ debits and no finished report; the consumer builds the snapshot and emits `report_ready` (deduped, `report:<period_key>`), so a missed run is repaired the next day without a double push. `report_alerts_enabled` gates only the notification, not the snapshot.
- The endpoints only read: `GET /reports`, `GET /reports/:period` (404 when none), `POST /reports/:period/viewed` (204, sets `viewed_at` once).
- All copy is in the app. The snapshot holds facts and ids, so the Worker needs no LLM.

## Release order

1. **Ship the OTA first** (`cd frontend && npm run publish:update -- --message "Broke Report"`). It is JS only (no native module), so it goes to 1.5.0 installs. Until the API is live the app is safe: the reports list fails quietly, so the Home banner and the Insights shelf stay hidden, and Settings → Broke Reports shows "Couldn't load your reports" with Retry; the sample works offline. (This is the reverse of the usual "API first" rule in `docs/RELEASE.md` on purpose: nothing in the app breaks without the API, and users get the build before the first report can land.)
2. **Run the D1 migration remotely**: `cd api && npx wrangler d1 migrations apply DB --remote` (`0014_broke_report.sql`: `monthly_reports`, the two `user_settings` columns, the rebuilt `notifications` table).
3. **Deploy the Worker** (`npx wrangler deploy`, or the Deploy API workflow, which also applies migrations first). The cron starts producing reports on the next IST day 1 to 3; to see one earlier, call `POST /api/v1/internal/reports/run`.

## Not verified visually

The UI was built without running it. Checked: `tsc`, `lint`, unit and render-smoke tests (every slide with a full and a minimal snapshot, at every roast level, the player's navigation, the share helper with mocks). Not checked on a device: spacing and type fit on small and large screens, the look of the tones in both themes, animation timing and feel, the Skia capture of the off-screen share card on Android, the share sheet, hold / swipe gesture feel against the segmented bar, and the confetti on `win` / `closing`. Walk the sample once in light and dark, at 100% and at the largest font size.

## Review fixes (applied)

- One screen per report (`getId` by `periodKey`) and the player is keyed by the report's period, so a link or push opened over a report starts a fresh story and marks the new one viewed.
- A snapshot with no playable slide plays cover, damage and closing; a Close button always renders.
- Snapshots and list rows are mapped on read (`select`), including persisted copies, and the mapper repairs or drops every nested section (bad win, payee, categories, weekday, title). Query keys carry `REPORT_CACHE_SHAPE`: bump it when the mapped shape changes. A cached value that is not a snapshot is fetched again.
- Copy: counts go through `count()` ("1 visit"), streak lines have units, a streak of 0 is left out, no calm line without no-spend days. The shared picture uses `title.shareTagline`, which never names a payee unless "Show amounts" is on.
- The story helpers (`useAppIsActive`, `useScreenReaderEnabled`, `useClockValue`, the easing functions) live in `src/hooks` and `src/utils`; the reel files re-export them.
- Push, deep link, route and period math share `utils/periodKey.ts`. Sign-out and user switch also clear the Home banner dismissals. The banner re-evaluates at India's midnight (`useIstNow`).

## Follow-ups

- The list endpoint returns no title or total, so Settings rows and shelf tiles show month and payment count only. Adding `title_id` and `spent` to the list rows would allow a title badge there.
- Opening a different report while one is on screen stacks a second screen (so Close returns to the first). Replacing instead of pushing would need a `replace` at the call sites.
