# Broke Report

Status: **building** (2026-10-26). A monthly, story-style recap ("Wrapped" for your wallet): full-screen slides, one idea and
one big number each, playful copy, shareable. Facts only, no predictions.

## Decisions (locked)

- Name: **Broke Report**. Roast level is a user setting: `gentle | spicy | savage`, default `spicy`.
- Eligible month: **5 or more debits** in the month. Below that: no report, no push.
- Build order: API + snapshot first, then the app.
- Timezone: reports are built in **IST** (`Asia/Kolkata`), like the email digests. The snapshot records it.
- The snapshot holds **facts and ids only**. All copy (titles, roast lines) lives in the app, keyed by ids and
  switched by the roast level, so changing the level re-renders old reports and the Worker needs no LLM.

## Entry points

1. Home: transient "Your <Month> Broke Report is ready" card, 1st to 7th or until viewed.
2. Push + inbox: kind `report_ready`, action `report`, deep link into the report.
3. Insights: "Past reports" shelf of month tiles.
4. Settings: a "Broke Reports" row (new `SettingsBrokeReports` screen) lists every past report, newest first, so users can
   always reopen an old one. Uses `GET /reports`; unviewed ones are marked.
5. Route `BrokeReport { periodKey }`: full-screen stack route over the tabs (reel-style player: tap/hold/swipe).

## Slides (server decides which are present)

`cover`, `damage`, `lineup`, `regular`, `moment`, `rhythm`, `win`, `closing`. Cover, damage, lineup and closing are
always present for an eligible month; `regular`, `moment`, `rhythm`, `win` appear only when notable.

## API

Migration `0014_broke_report.sql`:
- `monthly_reports(user_id, period_key 'YYYY-MM', version, snapshot TEXT json, created_at, viewed_at, PK(user_id, period_key))`.
- `user_settings.report_alerts_enabled INTEGER NOT NULL DEFAULT 1`, `user_settings.report_roast_level TEXT NOT NULL DEFAULT 'spicy'`.
- Rebuild `notifications` so `kind` also allows `report_ready` and `action_type` also allows `report`.

Endpoints (feature `api/src/features/reports/`, mounted at `/reports`). **The report is built only by the cron / queue
path; the endpoints only read what is stored.**
- `GET /api/v1/reports` -> `{ items: [{ period_key, year, month, debit_count, viewed: boolean }] }`
  stored reports of the last 12 months, newest first. Builds nothing.
- `GET /api/v1/reports/:period` -> the stored snapshot. 404 when none is stored (not yet built, not eligible, current or
  future month). Builds nothing.
- `POST /api/v1/reports/:period/viewed` -> sets `viewed_at` once. 204; 404 when none is stored.
- `POST /api/v1/internal/reports/run` (cron secret `X-Email-Cron-Secret`, like `/internal/email/run`) -> runs the same
  fan-out now; optional body `{ "period_key": "YYYY-MM" }` for another finished month (default: the previous month).
  Answers `{ period_key, selected, queued, failed }`. Safe to repeat.

Cron: the existing daily 02:30 UTC cron fans out on **IST days 1 to 3** (the 1st plus two catch-up days) for the previous
month: one `{ type: 'report', user_id, period_key }` message on the email queue for every user with 5+ debits that month
and **no finished report** (no current-version `monthly_reports` row with `notified_at` set, which is also set for users with alerts off), so a missed or partly failed run (snapshot or notification) or a snapshot version bump is repaired the next day without duplicates. The report is
built for every such user; `report_alerts_enabled` gates only the push / inbox notification. The consumer builds the
snapshot (insert-or-ignore) and emits the `report_ready` notification through the deduped emitter (`report:<period_key>`,
push if device notifications are on), so redelivery or catch-up never double-notifies. Retry / DLQ semantics are the
digest ones (transient -> retry with backoff, permanent -> log + ack); one user's failure does not block the others.

### Snapshot v1 (all money as decimal strings, like the rest of the API)

```jsonc
{
  "version": 1, "period_key": "2026-10", "year": 2026, "month": 10, "timezone": "Asia/Kolkata", "generated_at": "...",
  "slides": ["cover","damage","lineup","regular","moment","rhythm","win","closing"],
  "debit_count": 41, "spent": "18620.00", "income": "52000.00",
  "usual_spent": "19900.00" | null,       // median of up to 3 earlier complete months with data (1 month: that month, 2: mean)
  "vs_usual": "same" | "up" | "down" | null,  // notable = |diff| >= max(500, 25% of usual); null when no usual
  "vs_usual_delta": "1280.00" | null,
  "categories": [ { "id","name","icon_name","color","amount","share","count" } ],  // top 3, then one "Other" (id null)
  "top_payee": { "payee_key","display_name","count","amount" } | null,              // most visits, min 3 visits
  "biggest_spend": { "amount","display_name","category_name","date" } | null,
  "busiest_day": { "date","amount","count" } | null,
  "weekday": { "totals": ["..x7 Mon..Sun"], "peak_index": 4, "weekend_share": 0.41 },
  "no_spend_days": 9, "longest_no_spend_streak": 3,
  "first_week_share": 0.38,                 // share of spend in days 1-7
  "win": { "kind": "category_down" | "no_spend_streak" | "lowest_month" | "none", ... },
  "title": { "id": "weekend_warrior", "evidence": { ... } }
}
```

Title ids, first match wins: `one_big_splurge` (biggest spend >= 35% of spend), `loyalist` (top payee >= 8 visits or
>= 25% of debit count), `weekend_warrior` (weekend share >= 50%), `payday_sprinter` (first week >= 45%),
`thousand_cuts` (>= 40 debits and median debit <= 5% of spend), `ghost` (no-spend days >= 10), `steady` (default).

## App

`features/brokeReport/`: slide player on the reel engine, one component per slide, copy tables per roast level, share
(Skia `makeImageFromView` -> file via `expo-file-system` -> `expo-sharing`; no new native module, so it ships by OTA; amounts hidden by default), Home card, Insights shelf, notification action
`report`, Settings -> Notifications roast level + toggle, glossary entry.

## Tests

API: snapshot builder (each slide gate, usual math, titles, IST month edges, sparse month), routes (auth, 404s, lazy
build, viewed), consumer (idempotent, notification dedupe), settings, migration rebuild of `notifications`. App: copy
selection per level, slide gating, hooks, notification action mapping.
