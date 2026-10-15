# Dime Android home-screen widgets — plan

Status: built (2026-10-15), version **1.1.0**. Phases 0-5 are in code; a device check, the picker preview images and the release APK remain. Android only. Ships in a **new APK** (native code), not OTA.

## 1. What Android widgets can and can't do

| Can | Can't |
|---|---|
| Show text, numbers, icons, progress bars, images, lists | **Host a text field.** Widgets are `RemoteViews` drawn by the launcher; `EditText` is not supported, and the app can't read anything typed into a widget |
| Run code when a button is tapped (headless JS task in the background, no app UI) | Animate freely or run React components live; the widget is a rendered snapshot that we push updates to |
| Open the app on a specific screen (deep link) | Refresh more often than every ~30 min on their own (Android limit); faster updates come from the app pushing them |
| Have several sizes, resizing, and a configuration screen when added | Use the app's in-memory state; data must come from storage the background task can read |

**So: can you add a transaction from the widget itself?**
- **Typing an amount inside the widget: no** (platform limit above).
- **One-tap presets: yes.** Buttons like "☕ Chai ₹20" or "🛺 Auto ₹50" post a real transaction from a background task without opening the app, then the widget shows "Added ₹20 · Chai — Undo". Presets are chosen in the widget's setup screen (or learned from your most frequent small expenses).
- **Anything else: one tap opens a focused screen** — a compact "quick add" screen with the amount keypad already focused, or straight into receipt scan / voice capture. This is how Google Tasks, Splitwise and most finance apps do it.

## 2. Widgets

| # | Widget | Sizes | Shows | Taps |
|---|---|---|---|---|
| 1 | **This month** | 2×2, 4×1 | Spent this month, budget bar ("₹6,177 left of ₹30,000"), Recurring · Flexible split | Opens Home |
| 2 | **Quick add** | 4×1, 4×2 | `+ Add` · `Scan` · `Voice` buttons, plus up to 3 one-tap presets (4×2) | Add → quick-add screen; Scan → camera; Voice → recorder; preset → posts instantly |
| 3 | **Today** | 2×2 | Today's spend, last 2 transactions, small `+` | Row → transaction; `+` → quick add dated today |
| 4 | **Upcoming recurring** | 4×2 | Next 3 recurring items with due dates and amounts | Opens Budgets › Recurring |
| 5 | **Category budgets** | 4×2 | Top 3 categories with progress bars, colours and icons | Opens Budgets |
| later | Ask Dime | 4×1 | "Ask Dime anything…" bar | Opens agent chat focused |

All widgets: follow light/dark (soft dark palette), use the app's colours and icons, show **"Sign in to Dime"** when signed out, and offer a **"Hide amounts"** option (privacy on the home screen: shows ••••).

## 3. Library choice

| Option | Notes | Verdict |
|---|---|---|
| **react-native-android-widget** | Android-only. Widgets written in JSX with its primitives, rendered to RemoteViews. Handlers for add / update / resize / delete / **click**, configuration screens, `requestWidgetUpdate`. New Architecture supported; Expo guide. | **Recommended**: best fit for an Android-only Expo app, JS-only widget code, click handlers for one-tap presets |
| Voltra (Callstack) | JSX → JSON → Jetpack Glance; iOS + Android. Android side newer (dynamic widgets experimental). | Revisit if iOS widgets are wanted later |
| Custom Kotlin + Glance | Full control, a config plugin to inject Kotlin and receivers | Most work; only if the library blocks something |
| expo-widgets | iOS only | Not applicable |

Phase 0 is a spike to confirm the library on **Expo SDK 54 / RN 0.81 / New Architecture** with our local release build before committing.

## 4. Architecture

```
App (JS)                                  Background (headless JS task)
 ├─ queries / mutations / realtime         ├─ WIDGET_UPDATE / ADDED / RESIZED
 │    └─ widgetSnapshot.write()  ──MMKV──► │    └─ read snapshot → render widget JSX
 │         + requestWidgetUpdate()         ├─ WIDGET_CLICK (preset)
 │                                         │    └─ POST /api/v1/transactions (session from encrypted MMKV,
 │                                         │       refresh token if needed) → update snapshot → re-render
 └─ deep links (dime://add, /scan, ...)    └─ periodic refresh (30 min): GET /transactions/home → snapshot
```

- **Snapshot** (`widgetSnapshot` in MMKV, per user, no tokens): month totals, recurring/flexible split, budget, today's spend, last transactions, next recurring, top categories, presets, `updatedAt`. Written by the app after relevant queries settle, after every create/edit/delete, and on realtime events. Cleared on sign-out (part of `wipeUserData`).
- **Rendering** reads only the snapshot (fast, works offline). If it's older than a few hours, a background refresh calls the existing `GET /api/v1/transactions/home` + `GET /api/v1/recurring/month` with the stored session.
- **One-tap presets** call the existing `POST /api/v1/transactions` with an `Idempotency-Key` (no duplicates on double tap). Offline → queued in MMKV and sent on next app open/refresh; the widget shows "Queued". Undo = `DELETE` within ~10 s.
- **No new API endpoints** needed. Cost impact: a few extra Worker requests per user per day — negligible against the $5 plan.
- **Deep links:** switch the URL scheme from the generic `frontend://` to **`dime://`** in this APK (`dime://add?date=today`, `dime://scan`, `dime://voice`, `dime://budgets/recurring`, `dime://agent`). New quick-add screen: amount-first, category chips, one Save.

## 5. Phases

Built status: all phases below are implemented. The deliberate differences from the proposal: the Quick add widget is 4x1 with a 4x2 resize (presets and a status line appear from about 110dp tall); presets are managed in **Settings > Home screen widgets** (also `dime://settings/widgets`), not in a widget configuration screen; Undo lasts 2 minutes; a failed or offline tap is queued in an MMKV outbox (sent on the next widget update or app start, with its Idempotency-Key); `POST /api/v1/transactions` now also returns `id` and `created` (false for a duplicate, which Undo never deletes); category icons are not drawn (colour dots only); periodic widget refresh (every 30 minutes) re-renders from the snapshot and drains the outbox, nothing else.

| Phase | Work | Done when |
|---|---|---|
| **0. Spike** (½ day) | Add the library, one static widget, local `build:apk` on SDK 54 + New Arch | Widget renders on emulator + phone from a release APK |
| **1. Data layer** | `widgetSnapshot` builder + writer hooks, sign-out clearing, headless session access + refresh, `dime://` scheme | Snapshot always matches the app; unit tests for the builder |
| **2. This month + Quick add** | Widgets 1 and 2 (buttons via deep links), quick-add screen, light/dark, hide amounts | Usable on device; tapping opens the right screen |
| **3. One-tap presets** | Preset config screen, headless POST with idempotency, undo, offline queue | Preset adds a real transaction without opening the app; no duplicates |
| **4. Today, Upcoming, Category budgets** | Widgets 3–5 | All five widgets on device |
| **5. Polish & release** | Widget previews in the picker, resizing, a11y labels, periodic refresh tuning, docs; **version 1.1.0** (new runtime → new APK) | Release APK shared; OTA continues on 1.1.0 |

Same working rules: three-tier subagents per phase, one review + one test run per batch, emulator end-to-end check before each PR.

## 6. Testing

- Jest: snapshot builder, widget render functions (pure JSX → tree), headless click handler (mocked API: success, 401→refresh, offline queue, idempotent retry).
- Emulator (x86_64 release-like build): add each widget, sizes, light/dark, sign-out state, preset tap → transaction appears in the app and in the snapshot.
- Phone: release APK install, widget survives reboot, battery/background limits on Xiaomi (MIUI kills background tasks aggressively — needs a check and possibly guidance to allow autostart).

## 7. Risks

- **MIUI/Xiaomi background restrictions** can delay widget refreshes and headless tasks → app-pushed updates remain the main path; document "allow autostart" if needed.
- **Library compatibility** with RN 0.81 New Architecture → Phase 0 spike before any other work.
- **Runtime version bump** to 1.1.0: users on 1.0.0 keep getting OTA for 1.0.0 only until they install the widget APK.
- **Privacy** of amounts on the home screen → "Hide amounts" option, default visible (user choice).

## Sources
- [react-native-android-widget](https://docsearch.algolia.com/mcp/docs/repo/saleksovski/react-native-android-widget)
- [Home screen widgets and Live Activities in Expo](https://expo.dev/blog/home-screen-widgets-and-live-activities-in-expo)
- [Voltra (Callstack)](https://callstack.com/blog/live-activities-and-widgets-with-react-say-hello-to-voltra)
- [Expo widgets reference (iOS)](https://docs.expo.dev/versions/v56.0.0/sdk/widgets/)
- [React Native Android widgets with Expo and Glance (2026)](https://reactnativerelay.com/article/react-native-android-widgets-expo-glance-2026)
- [RemoteViews has no EditText (Kotlin Slack)](https://slack-chats.kotlinlang.org/t/8411622/haven-t-really-built-widgets-before-but-i-need-to-build-my-f)
- [RemoteViews source: supported view classes](https://code.yawk.at/android/android-9.0.0_r35/android/widget/RemoteViews.java)
