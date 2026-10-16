# Dime Android home-screen widget

Status: built, version **1.2.0**. Android only. Ships in a **new APK** (native code), not OTA. Replaces the five 1.1.0 widgets and the one-tap presets with one master widget.

## 1. What a widget can and can't do

| Can | Can't |
|---|---|
| Show text, numbers, icons, progress bars | **Host a text field.** Widgets are `RemoteViews` drawn by the launcher; there is no `EditText` |
| Open a URL when tapped (`OPEN_URI`) | Show UI from a click handler. A custom click only reaches the headless JS task, which has no window and a 30 s limit |
| Be redrawn by the app (`requestWidgetUpdate`) | Refresh by itself more often than every ~30 min |

So typing, the camera and the microphone cannot live in the widget. The buttons open a small **transparent card activity** over the home screen instead, which does the work and closes, without ever showing the full app.

## 2. The widget (`Dime`, 4x3)

Top to bottom:
- **This month** and the amount spent (tap: opens Home).
- Budget bar and "₹X left of ₹Y" (just the spent amount without a budget).
- "Recurring ₹15k · Flexible ₹3k".
- Top 3 categories with a colour dot, amount and a thin bar (right column).
- A status line (only when the last capture is under 10 minutes old): "Reading receipt…", "Added ₹250 · Swiggy", or what went wrong.
- Five equal buttons, each an SVG icon and a label:

| Button | Link | Goes to |
|---|---|---|
| Add (accent filled) | `dimecard://add` | Quick-add card |
| Scan | `dimecard://scan` | Camera, then the pill |
| Gallery | `dimecard://gallery` | System photo picker, then the pill |
| Voice | `dimecard://voice` | Listening pill |
| Ask AI | `dime://agent` | The app's agent chat |

At smaller sizes the categories column (and the split line) goes first; the buttons always stay. Light/dark follows the app theme preference (or the OS for "System default"). "Hide amounts on widget" (Settings > Appearance, Android only) shows ₹ •••• everywhere, status line included. Signed out: "Sign in to Dime", no buttons, a tap opens the app. A snapshot from a past month shows ₹— and "Open Dime to refresh". The widget renders from MMKV only (no network, no session).

Files: `frontend/src/widgets/` (`DimeWidget.tsx` layout, `dimeWidgetModel.ts` formatting, `widgetIcons.ts`, `renderWidget.tsx`, `widgetTaskHandler.tsx`). Every component file starts with `"use no memo"`: the library calls widget components as plain functions, which the React Compiler breaks.

## 3. The capture card

`WidgetActionsActivity` is a second `ReactActivity` (JS component `WidgetActions`, registered in `index.js`). `plugins/withWidgetActions.js` writes it at prebuild, with:
- manifest entry: exported, `singleTask`, its own `taskAffinity`, `excludeFromRecents`, `adjustResize`, intent filter for scheme `dimecard`. A separate scheme because `OPEN_URI` is a bare `ACTION_VIEW` and MainActivity claims `dime://`;
- theme `Theme.Dime.WidgetActions` (translucent, transparent window, dim on). The Kotlin class dims the home screen for Add only (`setDimAmount(0)` for the pill modes) and finishes on Back without asking JS (the JS runtime is shared with the app, whose back handlers must not answer for the card).

The card shares the JS runtime with the app but not its UI: `WidgetActionsRoot` mounts only `ThemeProvider` (no system-bar changes), a fresh non-persisted `QueryClient`, safe-area and keyboard providers. No navigation, notifications, realtime or snapshot writer. Code: `frontend/src/features/widgetActions/`.

| Mode | What happens |
|---|---|
| Add | Bottom card: amount (autofocus), optional payee ("Paid to (optional)", empty uses the category name), everyday expense categories (none preselected). Save needs an amount and a category, posts a manual transaction dated now (one Idempotency-Key per card), shows "Added ₹X · Payee" for 1.2 s, then closes. Tap outside or Back closes |
| Scan / Gallery | Opens the camera (same options as the app) or the system photo picker straight away; cancelling closes. Then prepares the photo, uploads it and shows a floating pill |
| Voice | Pill "Listening… 0:04" with Stop and Cancel. Recording happens while the pill is on screen, so no foreground service is needed. Minimum 3 s (Stop earlier keeps recording and says so). Then uploads |
| Signed out | "Sign in to Dime" with an "Open Dime" button |

After an upload the pill reads "Reading receipt…" (or "Reading voice note…") while the card polls `GET /api/v1/ingest/jobs/:id` every 2 s for up to 20 s, then shows "Added ₹X · Payee" for 1.5 s and closes. On timeout: "Still reading. We'll update the widget" and it closes. A 429 or a network error shows the server's message with "Try again" (same Idempotency-Key and file, so a retry cannot add it twice).

## 4. Data flow

- **Snapshot** (`lib/widgets/widgetSnapshotMmkv.ts`, no tokens): month totals, recurring/flexible split, budget, top 3 categories. Written by the app when the home overview or budgets change (`widgetSnapshotWriter.ts`), and by the card straight from the API after a capture (`refreshWidgetSnapshotFromApi.ts`, using the same `buildWidgetSnapshotFromData`). Cleared on sign-out.
- **Capture status** (`lib/widgets/widgetCaptureMmkv.ts`): `{kind: reading|added|failed, text, at, userId, jobId?}` plus a list of pending job ids. Written by the card, read by the widget, cleared on sign-out.
- **Headless task** (`widgetTaskHandler.tsx`): on `WIDGET_UPDATE` it draws, asks once (5 s budget) about captures still pending ("Reading receipt…") and settles them, then draws again. Taps never reach it: every button opens a link natively.
- **API** (`api/src/features/ingest`): receipt and voice uploads return `202 {accepted: true, job_id}` (a replay with the same Idempotency-Key returns the same `job_id`). `GET /api/v1/ingest/jobs/:id` is user-scoped (404 for another user's job) and returns `{status, transaction?}`; the consumer already records `{transaction_id}` on the job, and a payment-hash duplicate counts as done with the existing transaction.

## 5. Also in 1.2.0 (native splash fixes)

- MainActivity handles `fontScale|density|locale|layoutDirection|smallestScreenSize` itself, so the activity is not recreated with the splash replayed.
- The window background is night-aware (`values-night` `activityBackground`, the dark splash colour); the status bar is transparent; `splashGate.js` no longer repaints the window light.
- The in-app theme choice is handed to Android (`UiModeManager.setApplicationNightMode`, API 31+, through the local Expo module `frontend/modules/dime-system`), so the system splash follows it after a restart.

## 6. Removed from 1.1.0

One-tap presets, the queued-tap outbox and Undo (`widgetPreset*`, `widgetSnapshotBump`), Settings > Home screen widgets and `dime://settings/widgets`, and the This month / Quick add / Today / Upcoming recurring / Category budgets widgets. The old `widget-presets` MMKV store is deleted on first start. The snapshot no longer holds today's spend, recent transactions or recurring items.

## 7. Testing

- Jest: the widget model and render tree, the card link parser, the polling helper (done, failed, timeout, transient errors), the capture flow, the status store, the snapshot builder from plain data, the plugin's manifest/style/Kotlin output, removal of the preset wiring.
- API (Vitest, real local D1): `job_id` in 202 and on replay, job status pending → done with the transaction, failed, deleted transaction, 404 for another user.
- Device (not automated): add the widget on the emulator and a phone, each button, light/dark, sign-out state, a receipt end to end, widget survives a reboot. Xiaomi/MIUI may need Autostart for the background refresh.

## 8. Risks

- **Shared JS runtime.** The card and the app run in one runtime, so a handler registered by one hears events meant for the other. The card only reacts to `dimecard://` links, never uses `BackHandler`, and closes through a native call that does nothing unless the card is the current activity.
- **Process death.** If the process is killed while the pill waits, the job stays pending and the widget settles it on its next update (at most ~30 min).
- **MIUI/Xiaomi** may delay background refreshes.
