# 🏗️ Tech Stack — Expense Tracker App

> **Project Status:** Brainstorm & Planning Phase  
> **Platform:** Android Only (v1)  
> **Developer:** Solo  
> **Last Updated:** April 2026 — added Zustand, React Navigation v7 rationale. Folder structure moved to separate document.

---

## 📋 Table of Contents

1. [Stack Overview](#stack-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Frontend](#frontend)
   - React Native + Bare Expo Workflow
   - EAS
   - NativeWind v4
   - Reanimated 3
   - Gesture Handler
   - React Navigation v7
   - Zustand
   - TanStack React Query
   - MMKV
   - WatermelonDB
   - Victory Native XL
4. [On-Device AI](#on-device-ai)
5. [Backend Server](#backend-server)
6. [Database & Cloud](#database--cloud)
7. [Cost Breakdown](#cost-breakdown)
8. [Minimum Device Requirements](#minimum-device-requirements)

---

## Stack Overview

| Layer                 | Technology                        | Purpose                                           |
| --------------------- | --------------------------------- | ------------------------------------------------- |
| **Project Structure** | React Native (Bare Expo Workflow) | Full native Android access + Expo tooling         |
| **Build & Deploy**    | EAS (Build + Submit + Update)     | Cloud builds, Play Store deploy, OTA updates      |
| **UI & Styling**      | NativeWind v4                     | Tailwind-style utility classes for React Native   |
| **Animations**        | Reanimated 3                      | Fluid spring-physics micro-animations             |
| **Gestures**          | Gesture Handler                   | Swipe-to-categorize, swipe-to-delete              |
| **Navigation**        | React Navigation v7               | Bottom tab + stack navigation                     |
| **State Management**  | Zustand                           | Lightweight global UI & session state             |
| **Server State**      | TanStack React Query              | API data fetching, caching, background sync       |
| **Local Settings**    | MMKV                              | Ultra-fast key-value storage (30x AsyncStorage)   |
| **Local Database**    | WatermelonDB                      | High-performance SQLite for offline-first data    |
| **Charts & Graphs**   | Victory Native XL (Skia)          | GPU-rendered, 60fps smooth charts                 |
| **Cloud AI**          | Backend-routed LLM APIs           | Receipt parsing, merchant cleanup, categorization |
| **Backend Server**    | FastAPI (Python)                  | REST APIs, analytics, chart data computation      |
| **Database**          | Supabase (Postgres)               | Cloud sync, auth, storage, real-time              |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                        USER                              │
│         (Logs expense / Scans receipt / Asks AI)        │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                      FRONTEND                            │
│                                                         │
│   React Native (Bare Expo Workflow)                     │
│   ├── NativeWind v4          → Styling                  │
│   ├── Reanimated 3           → Animations               │
│   ├── Gesture Handler        → Swipe / Touch            │
│   ├── React Navigation v7    → Routing                  │
│   ├── MMKV                   → Local Settings           │
│   ├── WatermelonDB           → Local SQLite DB          │
│   └── Victory Native XL      → Charts & Graphs          │
│                                                         │
└───────────────┬──────────────────────┬──────────────────┘
                │                      │
                │ On-Device            │ HTTP REST API
                │                      │
┌───────────────▼──────────┐  ┌────────▼─────────────────┐
│        CLOUD AI API       │  │      BACKEND SERVER       │
│                           │  │                           │
│   Hosted multimodal LLM   │  │   FastAPI (Python)        │
│   via backend proxy       │  │                           │
│                           │  │   • REST APIs             │
│   • SMS / UPI parsing     │  │   • Analytics engine      │
│   • Receipt OCR           │  │   • Chart data compute    │
│   • Auto categorization   │  │   • Budget processing     │
│   • Spending insights     │  │   • Push notifications    │
│   • Natural lang queries  │  │   • Sync orchestration    │
│                           │  │                           │
│   Managed by backend      │  └────────┬─────────────────┘
│   Auth + rate limits      │           │
│   Cloud dependent         │           │
└───────────────────────────┘  ┌────────▼─────────────────┐
                               │    DATABASE & CLOUD       │
                               │                           │
                               │   Supabase                │
                               │   ├── Auth                │
                               │   │   (Google + Email)    │
                               │   ├── Postgres            │
                               │   │   (Cloud sync)        │
                               │   ├── Storage             │
                               │   │   (Receipt images)    │
                               │   └── Real-time           │
                               │       (Cross-device sync) │
                               └───────────────────────────┘
```

---

## Frontend

### React Native (Bare Expo Workflow)

The app is built with **React Native** using the **Bare Expo Workflow** — not managed Expo, not plain React Native CLI. This gives the best of both worlds:

- Full access to native Android APIs (`READ_SMS`, `NotificationListenerService`) via custom Expo modules
- Over-the-air (OTA) updates without Play Store resubmission
- Dramatically faster development setup vs bare React Native CLI
- No Expo Go limitations — full native module support

---

### EAS — Expo Application Services

EAS is Expo's cloud build and deployment infrastructure. Three services, all relevant to this project:

| Service        | What it does                                                                   | Cost                 |
| -------------- | ------------------------------------------------------------------------------ | -------------------- |
| **EAS Build**  | Builds `.apk` / `.aab` in the cloud — no Android Studio needed on your machine | 30 free builds/month |
| **EAS Submit** | Uploads the built app directly to Play Store automatically                     | Free                 |
| **EAS Update** | Pushes over-the-air JS updates to users — no Play Store resubmission needed    | Free, unlimited      |

**How Bare Workflow and EAS relate:**

```
Bare Expo Workflow          EAS
──────────────────    +     ──────────────────────
How your project            How you BUILD and
is structured               DEPLOY that project
```

They are independent but used together. Bare Workflow is the project structure. EAS is the build pipeline.

**Why EAS Build matters for a solo dev:**

- No need to set up a local Android build environment
- Build happens in Google's cloud — your machine just needs to push code
- 30 free builds/month is more than enough during development and early launch
- JS-only changes (UI tweaks, bug fixes, copy changes) go via **EAS Update** — free, unlimited, instant. Users get the fix without downloading a new version from Play Store.

---

### NativeWind v4

Tailwind CSS utility classes for React Native. v4 uses the **New Architecture (JSI bridge)** which means styles are applied natively with no JavaScript bridge overhead. The design language stays consistent, and styling is fast to write.

---

### Reanimated 3

The gold standard for React Native animations. Used for:

- Spring-physics micro-animations on all interactive elements
- FAB (Floating Action Button) expand/collapse
- Bottom sheet transitions when a new expense is detected
- Spending ring/arc animation on the home screen
- Smooth page transitions

---

### Gesture Handler

Native gesture recognition for:

- Swipe right to categorize a transaction
- Swipe left to delete
- Long press for transaction details
- Pull-to-refresh on transaction lists

---

### React Navigation v7

Bottom tab navigator with **maximum 4 tabs:**

```
Home | Transactions | Budgets | Insights
```

Nothing more. Deliberate simplicity to avoid overwhelming the user.

---

**What React Navigation v7 gives us over Expo Router:**

- Full control over every transition and gesture animation
- Custom edge swipe, bottom sheet transitions wire up cleanly with Reanimated 3 and Gesture Handler — made by the same team (Software Mansion)
- Battle-tested, massive community, no Bare Expo edge cases
- Android-only focus — no web routing overhead

---

### Zustand

Lightweight global state management. No reducers, no actions, no boilerplate — just a store and a hook.

**Why Zustand over alternatives:**

|                    | Zustand                 | Redux Toolkit | Context API              |
| ------------------ | ----------------------- | ------------- | ------------------------ |
| **Boilerplate**    | Minimal                 | Heavy         | None but re-render heavy |
| **Performance**    | ✅ Selective re-renders | ✅            | ❌ Full tree re-renders  |
| **Solo dev speed** | ✅ Fast                 | ❌ Slow       | ✅ Fast                  |
| **DevTools**       | ✅                      | ✅            | ❌                       |
| **Bundle size**    | ~1KB                    | ~30KB         | 0                        |

**What Zustand manages in this app:**

```
stores/
├── useAuthStore        → user session, login state
├── useTransactionStore → current month transactions in memory
├── useBudgetStore      → active budgets and usage
├── useInsightStore     → AI-generated insight cards
├── useUIStore          → bottom sheet state, active tab, loading flags
└── useOnboardingStore  → onboarding step, permissions granted
```

**What Zustand does NOT manage:**

- Persistent transaction data → WatermelonDB
- User preferences → MMKV
- Cloud data → Supabase via FastAPI

Zustand is the **in-memory runtime layer** — fast, reactive, temporary. It gets hydrated from WatermelonDB on app launch and stays in sync during the session.

---

### TanStack React Query

Server state management — handles all data fetching from FastAPI, caching, background refetching, and error states.

**What it solves:**
Without React Query, every screen that calls FastAPI needs manual `isLoading`, `isError`, and `data` state management plus its own refetch logic. React Query handles all of that automatically.

**How it fits alongside Zustand:**

|                     | Zustand                 | React Query                |
| ------------------- | ----------------------- | -------------------------- |
| **Purpose**         | UI state, session state | Server / API data          |
| **Example**         | Is bottom sheet open?   | This month's insights data |
| **Cache**           | In-memory session       | Configurable stale time    |
| **Source of truth** | Client UI               | FastAPI backend            |

They are not competitors — they handle completely different concerns and work together seamlessly.

**What React Query manages in this app:**

```
useQuery hooks
├── insights data          (staleTime: 5 minutes)
├── budget analytics       (staleTime: 1 minute)
├── cloud transaction sync (staleTime: 30 seconds)
└── user profile           (staleTime: 10 minutes)

useMutation hooks
├── create transaction     (invalidates transaction cache)
├── update budget          (invalidates budget cache)
└── delete transaction     (optimistic update + rollback)
```

**Key behaviours enabled:**

- Insights screen mounts → serves cached data instantly → refetches in background silently
- User adds expense → `invalidateQueries` → budget and insights auto-refresh
- API fails → automatic retry (3 attempts) → error state shown cleanly
- App comes back to foreground → stale queries refetch automatically

---

### MMKV

Synchronous key-value storage — 30x faster than AsyncStorage. Used for:

- User preferences and settings
- Onboarding completion flags
- Last-seen states
- App theme (dark/light)
- Quick-access cached values

---

### WatermelonDB

High-performance SQLite wrapper built specifically for React Native. The local source of truth for all expense data.

**Why WatermelonDB over plain SQLite or AsyncStorage:**

- Built for apps with thousands of records — expenses accumulate fast
- Lazy loading — only loads what's visible on screen
- Reactive — UI updates automatically when data changes
- Built-in sync adapters that work with Supabase
- Offline-first by design

**Data flow (Offline-First):**

```
User logs expense
      ↓
Saved to WatermelonDB immediately → instant UI response
      ↓
Syncs to Supabase in background when connected
      ↓
Other devices pick up via Supabase real-time
```

The app works perfectly with zero internet. Sync happens silently in the background.

---

### Victory Native XL

GPU-rendered charting library built on top of **React Native Skia**. The only charting library worth using for a premium, animation-heavy finance app.

**Why Victory Native XL over alternatives:**

| Library                 | Rendering  | Animations    | Customization | Verdict                   |
| ----------------------- | ---------- | ------------- | ------------- | ------------------------- |
| **Victory Native XL**   | GPU (Skia) | 60fps buttery | Full control  | ✅ Our pick               |
| Gifted Charts           | JS thread  | Basic         | Limited       | ⚠️ Okay for prototypes    |
| React Native Charts Kit | JS thread  | Minimal       | Very limited  | ❌ Skip                   |
| Echarts (WebView)       | WebView    | Good          | Rich          | ❌ Not truly native       |
| Raw Skia                | GPU        | 60fps         | Full control  | ❌ Too much solo dev work |

**Renders on the GPU — not the JS thread.** This means charts never block scrolling, never stutter, never jank. Reanimated 3 and Victory Native XL share the same Skia foundation, so animations between the two are seamless.

**Chart types used in this app:**

| Chart                   | Screen                           | Library Component |
| ----------------------- | -------------------------------- | ----------------- |
| **Spending arc / ring** | Home screen                      | Skia Arc (custom) |
| **Donut chart**         | Insights — category breakdown    | Victory Pie       |
| **Line chart**          | Insights — 30 day spending trend | Victory Line      |
| **Bar chart**           | Insights — month vs month        | Victory Bar       |
| **Area chart**          | Insights — cumulative spending   | Victory Area      |

---

### Cloud AI via Backend Gateway

**Runtime:** Server-side inference  
**Access:** Backend-managed API keys  
**Cost:** Provider-dependent cloud billing

#### Why backend-routed cloud AI?

The app now sends receipt images and extraction prompts to backend AI endpoints.
Backend handles provider selection, API keys, retries, and response normalization.

```
Mobile App
   ↓
FastAPI /api/v1/ai/*
   ↓
Cloud LLM provider(s)
   ↓
Structured JSON response
```

Mobile app no longer loads local models. Backend owns AI orchestration.

#### Why this approach

| Property                 | Detail                                  |
| ------------------------ | --------------------------------------- |
| **Device compatibility** | No local model/device constraints       |
| **Storage impact**       | No model download on phone              |
| **Rollout speed**        | Prompt/model updates via backend only   |
| **Observability**        | Centralized logs and error handling     |
| **Control**              | Quotas, auth, policy checks server-side |

#### What cloud AI handles in this app

| Task                         | How                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------- |
| **SMS / UPI parsing**        | Reads bank SMS → extracts amount, merchant, debit/credit type                   |
| **Receipt scanning**         | Photo → OCR + line item extraction in one pass (no separate OCR library needed) |
| **Auto-categorization**      | "Swiggy ₹320" → Food & Dining, with reasoning                                   |
| **Merchant name cleanup**    | "SWGY\*SWIG9381" from bank SMS → "Swiggy"                                       |
| **Spending insights**        | "You spent 40% more on food vs last week"                                       |
| **Natural language queries** | "How much did I spend on weekends this month?" — answered via backend           |

#### Integration Path

Mobile sends image to `POST /api/v1/ai/receipt-parse`. Backend calls cloud model and returns normalized JSON.

---

## Backend Server

### FastAPI (Python)

**Why FastAPI over Node.js (already know) and Spring Boot (overkill):**

- Solo dev — Python writes faster, less boilerplate
- Auto-generated Swagger UI docs out of the box — test APIs instantly
- Native home for analytics: **Pandas, NumPy** for complex spending computations
- Future-proof for any server-side AI features
- Full TypeScript on frontend, Python on backend — clean separation, right tool for each job

**What FastAPI handles:**

- REST APIs consumed by the React Native frontend
- Complex analytics and chart data computation
- Budget alert processing logic
- Push notification triggers
- Sync orchestration with Supabase
- Any business logic that shouldn't live on the client

**Package manager:** `uv` (dramatically faster than pip, modern Python tooling)

**Server hosting:** Railway or Render free tier to start — upgrade when there's revenue

---

## Database & Cloud

### Supabase

Supabase is the backend-as-a-service layer handling everything cloud-related. It sits between FastAPI and the data.

| Feature                | What it does in this app                                               |
| ---------------------- | ---------------------------------------------------------------------- |
| **Auth**               | Google Sign-In + email login                                           |
| **Postgres**           | Primary relational database for cloud sync and backup                  |
| **Storage**            | Receipt image backup                                                   |
| **Real-time**          | Cross-device sync — changes on one phone appear on another             |
| **Row-Level Security** | User A can never access User B's financial data — enforced at DB level |

**Why Postgres (not NoSQL):**

Financial data is relational by nature — transactions belong to categories, categories belong to budgets, budgets belong to users. SQL is the right tool. Supabase gives Postgres out of the box with zero config.

**Free tier includes:**

- 500MB database storage
- 5GB file storage
- 50,000 monthly active users
- Unlimited API requests

More than enough to take this from zero to thousands of users without spending a rupee.

---

## Cost Breakdown

> Honest cost breakdown for a solo dev launching this app

| Item                                         | Cost            | Notes                                      |
| -------------------------------------------- | --------------- | ------------------------------------------ |
| **Cloud LLM API**                            | Usage-based     | Billed by provider; routed via backend     |
| **EAS Build**                                | ₹0              | 30 free builds/month — enough for solo dev |
| **EAS Submit**                               | ₹0              | Free                                       |
| **EAS Update (OTA)**                         | ₹0              | Free, unlimited JS pushes                  |
| **Zustand**                                  | ₹0              | Open source, MIT license                   |
| **TanStack React Query**                     | ₹0              | Open source, MIT license                   |
| **Victory Native XL**                        | ₹0              | Open source, MIT license                   |
| **NativeWind, Reanimated, all npm packages** | ₹0              | All open source                            |
| **WatermelonDB**                             | ₹0              | Open source                                |
| **FastAPI + Python**                         | ₹0              | Open source                                |
| **Supabase**                                 | ₹0              | Free tier covers early growth              |
| **FastAPI hosting**                          | ₹0–700/month    | Railway/Render free tier to start          |
| **Google Play Store**                        | ₹1,650 one-time | Developer account registration             |

**Total to launch: ₹1,650 one-time + ₹0/month until scale.**

---

## Minimum Device Requirements

Since there is no fallback — the app requires full AICore support.

| Requirement         | Minimum                                                  |
| ------------------- | -------------------------------------------------------- |
| **Android version** | Android 14+                                              |
| **RAM**             | 6 GB                                                     |
| **Storage free**    | No local model storage required                          |
| **Chipset**         | Snapdragon 8 Gen 1 / Tensor G2 / Dimensity 9000 or newer |
| **AICore**          | Required                                                 |

This covers the vast majority of Android phones sold in India from 2022 onwards — the primary target audience for UPI/GPay expense tracking.

---

> _Document maintained as part of project planning. Last brainstormed with Claude, April 2026._
