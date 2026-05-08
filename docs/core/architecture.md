# 🏛️ Architecture & Folder Structure — Expense Tracker App

> **Platform:** Android Only  
> **Developer:** Solo  
> **Last Updated:** April 2026 — corrected frontend structure, added full backend architecture

---

## 📋 Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Frontend Architecture](#frontend-architecture)
   - Layer Diagram
   - Data Flows
   - Folder Structure
   - Architecture Rules
   - Layer Responsibilities
3. [Backend Architecture](#backend-architecture)
   - Layer Diagram
   - Request Lifecycle
   - Folder Structure
   - Architecture Rules
4. [Database Schema](#database-schema)
   - Tables
   - Row Level Security

---

## System Architecture Overview

How the frontend, backend, and database relate at the highest level.

```
┌──────────────────────────────────────────────────────────────┐
│                        ANDROID APP                            │
│                                                              │
│   React Native + Bare Expo                                   │
│                                                              │
│   ┌─────────────────┐        ┌──────────────────────────┐   │
│   │  Cloud AI APIs  │        │  WatermelonDB (SQLite)   │   │
│   │  via backend    │        │  Local offline-first DB  │   │
│   │  internet req.  │        │  Syncs in background     │   │
│   └─────────────────┘        └──────────────────────────┘   │
│                                                              │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS REST API
                             │ JWT Auth Header
┌────────────────────────────▼─────────────────────────────────┐
│                      BACKEND SERVER                           │
│                                                              │
│   FastAPI (Python)                                           │
│   Feature-based modular architecture                         │
│   Analytics, chart data, sync, business logic               │
│                                                              │
└────────────────────────────┬─────────────────────────────────┘
                             │ Supabase SDK / PostgREST
┌────────────────────────────▼─────────────────────────────────┐
│                    DATABASE & CLOUD                           │
│                                                              │
│   Supabase                                                   │
│   ├── Postgres     → Primary relational database             │
│   ├── Auth         → JWT tokens, Google Sign-In              │
│   ├── Storage      → Receipt images                          │
│   └── Realtime     → Cross-device sync subscriptions         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│                 SCREENS (screens/)                   │
│           UI only — zero business logic              │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│              COMPONENTS (components/)                │
│        Reusable UI — no data fetching                │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│                 HOOKS (hooks/)                       │
│       Bridge between UI and data / features          │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
┌──────────▼───────┐      ┌───────────▼──────────────┐
│  STORE (store/)  │      │   FEATURES (features/)    │
│  Zustand         │      │   SMS, Scanner, AI, Sync  │
│  UI & session    │      │   Self-contained modules  │
│  state only      │      └───────────┬──────────────┘
└──────────┬───────┘                  │
           │                          │
┌──────────▼──────────────────────────▼──────────────┐
│              SERVER STATE LAYER                      │
│                                                      │
│   TanStack React Query                               │
│   Caching · Background refetch · Error handling     │
│   Optimistic updates · Request deduplication        │
└──────────────────────────┬──────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────┐
│                    DATA LAYER                        │
│                                                      │
│   WatermelonDB (db/)        services/ → FastAPI      │
│   Local SQLite              Remote REST API          │
│   Offline-first             Cloud sync & analytics   │
└─────────────────────────────────────────────────────┘
```

---

### Data Flows

#### 1. Automatic Transaction — SMS / UPI Detected

```
Bank SMS / GPay notification received
        ↓
features/sms/ — regex parsing + backend cloud normalization
        ↓
Extracted: { merchant, amount, type, date }
        ↓
useUIStore (Zustand) — triggers bottom sheet
        ↓
User taps confirm
        ↓
db/ — saved to WatermelonDB immediately (offline-first)
        ↓
useTransactionStore (Zustand) — in-memory state updates
        ↓
UI re-renders instantly
        ↓
features/sync/ — queues background sync to Supabase
```

---

#### 2. Manual Expense Log

```
User taps FAB
        ↓
Bottom sheet opens (useUIStore)
        ↓
User enters amount, selects category, adds note
        ↓
hooks/useTransactions — calls db/ to save
        ↓
WatermelonDB saves locally
        ↓
Zustand store updates → UI updates instantly
        ↓
features/sync/ — background sync to Supabase
```

---

#### 3. Receipt Scan

```
User: FAB → Scan Receipt
        ↓
features/scanner/ — camera captures image
        ↓
backend /api/v1/ai/receipt-parse — image sent to cloud model via FastAPI
        ↓
Cloud AI returns: { merchant, amount, type, category, note, transaction_at }
        ↓
Confirm card shown to user (all fields editable)
        ↓
On confirm → same flow as Manual Expense Log
```

---

#### 4. Insights & Charts

```
User opens Insights tab
        ↓
hooks/useInsights — React Query useQuery
        ↓
React Query checks cache (staleTime: 5 minutes)
  ├── Fresh  → returns cached data instantly, zero network
  ├── Stale  → serves cache + refetches silently in background
  └── Empty  → skeleton loader → fetches from FastAPI
        ↓
services/insightService → HTTPS to FastAPI /api/v1/insights
        ↓
FastAPI → features/insights/service.py computes analytics
        ↓
features/insights/repository.py → Postgres aggregation queries
        ↓
Structured chart data returned → React Query caches it
        ↓
Victory Native XL renders charts with entry animations
```

---

### Frontend Folder Structure

```
expense-tracker/
│
├── android/                         # Native Android project (Bare Expo)
│
├── assets/                          # Static files — Expo expects at root
│   ├── fonts/                       # Inter + JetBrains Mono
│   ├── lottie/                      # Lottie animation JSON files
│   └── images/                      # App icons, onboarding illustrations
│
├── src/                             # ALL source code lives here
│   │
│   ├── navigation/                  # React Navigation — all nav config
│   │   ├── RootNavigator.tsx        # Root stack navigator
│   │   ├── TabNavigator.tsx         # Bottom tab navigator (4 tabs)
│   │   ├── AuthNavigator.tsx        # Onboarding / auth stack
│   │   ├── linking.ts               # Deep link configuration
│   │   └── types.ts                 # Navigation param types (typed routes)
│   │
│   ├── screens/                     # Screens — one folder per screen
│   │   ├── Home/
│   │   │   └── HomeScreen.tsx
│   │   ├── Transactions/
│   │   │   ├── TransactionsScreen.tsx
│   │   │   └── TransactionDetailScreen.tsx
│   │   ├── Budgets/
│   │   │   └── BudgetsScreen.tsx
│   │   ├── Insights/
│   │   │   └── InsightsScreen.tsx
│   │   └── Onboarding/
│   │       └── OnboardingScreen.tsx
│   │
│   ├── components/                  # Reusable UI — no business logic
│   │   ├── ui/                      # Primitive components
│   │   │   ├── Button/
│   │   │   │   ├── Button.tsx
│   │   │   │   └── Button.types.ts
│   │   │   ├── Card/
│   │   │   │   ├── Card.tsx
│   │   │   │   └── Card.types.ts
│   │   │   ├── Badge/
│   │   │   ├── BottomSheet/
│   │   │   └── Skeleton/
│   │   └── shared/                  # Composed components
│   │       ├── TransactionCard/
│   │       │   ├── TransactionCard.tsx
│   │       │   └── TransactionCard.types.ts
│   │       ├── BudgetBar/
│   │       ├── SpendingRing/
│   │       ├── InsightCard/
│   │       └── CategoryChip/
│   │
│   ├── features/                    # Self-contained feature modules
│   │   ├── sms/
│   │   │   ├── components/          # SMS-specific UI if any
│   │   │   ├── hooks/               # useSmsParsing, useSmsListener
│   │   │   ├── utils/               # Regex patterns, bank SMS parsers
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── scanner/
│   │   │   ├── components/          # Camera UI, confirm card
│   │   │   ├── hooks/               # useScanner, useImageCapture
│   │   │   ├── utils/               # Image preprocessing helpers
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── ai/                      # (removed) moved to backend cloud APIs
│   │   └── sync/
│   │       ├── hooks/               # useSyncStatus
│   │       ├── utils/               # Conflict resolution logic
│   │       ├── types.ts
│   │       └── index.ts
│   │
│   ├── store/                       # Zustand — runtime state only
│   │   ├── useAuthStore.ts          # User session, login state
│   │   ├── useTransactionStore.ts   # Current session transactions
│   │   ├── useBudgetStore.ts        # Active budgets and usage %
│   │   ├── useInsightStore.ts       # AI insight cards
│   │   ├── useUIStore.ts            # Bottom sheets, modals, loaders
│   │   └── useOnboardingStore.ts    # Onboarding step, permissions
│   │
│   ├── hooks/                       # Global shared hooks only
│   │   ├── useTransactions.ts       # Read/write transactions
│   │   ├── useBudgets.ts            # Budget state and calculations
│   │   ├── useInsights.ts           # Insights with React Query
│   │   └── useAppState.ts           # Foreground/background detection
│   │
│   ├── services/                    # HTTP layer — FastAPI calls only
│   │   ├── api.ts                   # Axios instance + interceptors + auth
│   │   ├── transactionService.ts    # Sync transactions to cloud
│   │   ├── budgetService.ts         # Budget CRUD via API
│   │   └── insightService.ts        # Analytics and chart data
│   │
│   ├── db/                          # WatermelonDB — local SQLite
│   │   ├── index.ts                 # DB instance export
│   │   ├── schema.ts                # Table and column definitions
│   │   └── models/
│   │       ├── Transaction.ts       # Transaction model + queries
│   │       ├── Category.ts          # Category model
│   │       └── Budget.ts            # Budget model + queries
│   │
│   ├── providers/                   # React context providers
│   │   ├── QueryProvider.tsx        # React Query client + devtools
│   │   ├── GestureProvider.tsx      # Gesture Handler root view
│   │   ├── SafeAreaProvider.tsx     # Safe area context
│   │   └── index.tsx                # Composes all providers cleanly
│   │
│   ├── config/                      # App configuration
│   │   ├── env.ts                   # Typed environment variables
│   │   ├── queryClient.ts           # React Query client config
│   │   └── constants.ts             # Non-design app-level constants
│   │
│   ├── utils/                       # Pure stateless helper functions
│   │   ├── currency.ts              # ₹ formatting, parsing, conversion
│   │   ├── date.ts                  # Date formatting, ranges, periods
│   │   ├── validation.ts            # Input validators
│   │   └── storage.ts               # Typed MMKV wrapper helpers
│   │
│   ├── constants/                   # Design tokens — single source of truth
│   │   ├── colors.ts
│   │   ├── typography.ts
│   │   ├── spacing.ts
│   │   └── animations.ts
│   │
│   └── types/                       # Global shared TypeScript types
│       ├── transaction.types.ts
│       ├── budget.types.ts
│       ├── category.types.ts
│       ├── navigation.types.ts
│       └── api.types.ts
│
├── app.json                          # Expo config
├── babel.config.js
├── metro.config.js
├── tsconfig.json
└── package.json
```

---

### Frontend Architecture Rules

**Rule 1 — Screens are dumb**
`screens/` files contain only layout and component composition. Zero business logic, zero direct store writes, zero API calls.

**Rule 2 — Features are fully self-contained**
Each folder in `features/` owns its own components, hooks, utils, and types. `features/sms/` never imports from `features/scanner/`. Shared logic moves to `hooks/` or `utils/`.

**Rule 3 — Constants are the single source of truth**
Colors, spacing, typography, and animation values are never hardcoded in components. One file change = design change everywhere.

**Rule 4 — Services are the only HTTP layer**
`services/` is the only code that makes HTTP calls. Hooks call services. Components never call services. Every service is trivially mockable.

**Rule 5 — Zustand is runtime only**
Zustand holds in-memory state for the active session. WatermelonDB is the persistence source of truth. Stores hydrate from WatermelonDB on launch and are discarded on close.

**Rule 6 — Types are shared, never duplicated**
All TypeScript interfaces live in `types/`. A `Transaction` type is defined once and imported everywhere.

**Rule 7 — No `app/` folder — that is Expo Router**
We use React Navigation v7. Screens live in `src/screens/`. Navigation config lives in `src/navigation/`.

---

### Frontend Layer Responsibilities

| Layer           | Folder            | Responsibility                | Can Import From                           |
| --------------- | ----------------- | ----------------------------- | ----------------------------------------- |
| **Screens**     | `src/screens/`    | Layout, composition only      | `components/`, `hooks/`                   |
| **Components**  | `src/components/` | Reusable UI, no data fetching | `constants/`, `types/`                    |
| **Hooks**       | `src/hooks/`      | Data bridge, orchestration    | `store/`, `features/`, `services/`, `db/` |
| **Zustand**     | `src/store/`      | Runtime UI & session state    | `types/` only                             |
| **React Query** | via `hooks/`      | Server state, caching         | `services/`, `types/`                     |
| **Features**    | `src/features/`   | Self-contained business logic | `db/`, `constants/`, `types/`             |
| **Services**    | `src/services/`   | HTTP calls to FastAPI only    | `types/` only                             |
| **Database**    | `src/db/`         | Local SQLite persistence      | `types/` only                             |
| **Providers**   | `src/providers/`  | Context setup, composition    | `config/`                                 |
| **Config**      | `src/config/`     | Env vars, client config       | Nothing                                   |
| **Utils**       | `src/utils/`      | Pure helper functions         | Nothing                                   |
| **Constants**   | `src/constants/`  | Design tokens                 | Nothing                                   |
| **Types**       | `src/types/`      | TypeScript interfaces         | Nothing                                   |

---

## Backend Architecture

### Layer Diagram

```
HTTP Request from App
        ↓
┌───────────────────────────────────────────────────────┐
│            API LAYER (api/v1/endpoints/)               │
│   Validates request shape via Pydantic                │
│   Authenticates via deps.py (JWT → Supabase verify)   │
│   No business logic — routing and validation only     │
└───────────────────────┬───────────────────────────────┘
                        │
┌───────────────────────▼───────────────────────────────┐
│         SERVICE LAYER (features/*/service.py)          │
│   All business logic lives here                       │
│   Orchestrates operations across repositories         │
│   Pure Python — no HTTP objects, no raw SQL           │
└───────────────────────┬───────────────────────────────┘
                        │
┌───────────────────────▼───────────────────────────────┐
│       REPOSITORY LAYER (features/*/repository.py)      │
│   All database queries live here                      │
│   Raw Supabase / Postgres calls only                  │
│   No business logic — data in, data out               │
└───────────────────────┬───────────────────────────────┘
                        │
┌───────────────────────▼───────────────────────────────┐
│                SUPABASE POSTGRES                       │
│   Row Level Security enforced at DB level             │
│   Users can only ever access their own data           │
└───────────────────────────────────────────────────────┘
```

---

### Request Lifecycle

```
POST /api/v1/transactions/sync

Step 1 → api/v1/endpoints/transactions.py
  Pydantic validates request body shape
  deps.py verifies JWT with Supabase
  Extracts current_user from token

Step 2 → features/transactions/service.py
  Deduplicates transactions
  Assigns missing categories
  Calculates budget impact
  Calls repository to persist

Step 3 → features/transactions/repository.py
  Upserts transaction rows in Postgres
  Returns persisted records

Step 4 → features/transactions/schemas.py
  Shapes response into clean Pydantic model

Step 5 → Response sent to app
  React Query cache invalidated on frontend
  UI updates automatically
```

---

### Backend Folder Structure

```
backend/
│
├── app/                              # All application code
│   │
│   ├── main.py                       # FastAPI entry point
│   │                                 # Registers all routers
│   │                                 # CORS, logging, error handlers
│   │                                 # Startup / shutdown events
│   │
│   ├── core/                         # App-wide infrastructure
│   │   ├── config.py                 # Pydantic BaseSettings — all env vars
│   │   │                             # App crashes on startup if vars missing
│   │   ├── security.py               # JWT verification via Supabase public key
│   │   ├── database.py               # Single Supabase client instance
│   │   ├── exceptions.py             # Custom exception classes + handlers
│   │   └── middleware.py             # Request logging, timing, error catching
│   │
│   ├── api/                          # All routes
│   │   ├── v1/                       # Versioned — v2 lives alongside when needed
│   │   │   ├── router.py             # Combines all v1 endpoint routers
│   │   │   └── endpoints/            # One file per domain
│   │   │       ├── transactions.py
│   │   │       ├── budgets.py
│   │   │       ├── insights.py
│   │   │       ├── categories.py
│   │   │       └── auth.py
│   │   └── deps.py                   # Shared FastAPI dependencies
│   │                                 # get_current_user(), get_db()
│   │                                 # Injected into every endpoint
│   │
│   ├── features/                     # Business logic — one folder per domain
│   │   ├── transactions/
│   │   │   ├── service.py            # Dedup, categorize, budget impact
│   │   │   ├── schemas.py            # Pydantic request + response models
│   │   │   ├── repository.py         # All transaction DB queries
│   │   │   └── utils.py              # Transaction-specific helpers
│   │   ├── budgets/
│   │   │   ├── service.py            # Budget calculation, breach detection
│   │   │   ├── schemas.py
│   │   │   ├── repository.py         # Budget + budget_periods queries
│   │   │   └── utils.py
│   │   ├── insights/
│   │   │   ├── service.py            # Analytics orchestration
│   │   │   ├── schemas.py            # Chart data response shapes
│   │   │   ├── repository.py         # Complex Postgres aggregation queries
│   │   │   └── utils.py              # Aggregation, trend computation helpers
│   │   ├── categories/
│   │   │   ├── service.py
│   │   │   ├── schemas.py
│   │   │   └── repository.py
│   │   └── auth/
│   │       ├── service.py            # Profile management
│   │       ├── schemas.py
│   │       └── utils.py
│   │
│   └── models/                       # Shared Pydantic base models
│       ├── base.py                   # BaseModel with shared config
│       └── common.py                 # Pagination, shared response types
│
├── tests/                            # Mirrors app/ structure exactly
│   ├── conftest.py                   # Pytest fixtures, test DB setup
│   ├── api/
│   │   └── v1/
│   │       ├── test_transactions.py
│   │       ├── test_budgets.py
│   │       └── test_insights.py
│   └── features/
│       ├── test_transaction_service.py
│       └── test_insights_service.py
│
├── .env                              # Local env vars — never committed to git
├── .env.example                      # Template — committed to git
├── pyproject.toml                    # Dependencies managed by uv
├── Dockerfile                        # Production container
└── README.md
```

---

### Backend Architecture Rules

**Rule 1 — Endpoints never touch the database**
`api/v1/endpoints/` files only validate input, check auth, call a service, and return a response. Zero direct DB queries.

**Rule 2 — Services never touch HTTP**
`features/*/service.py` contains pure Python business logic only. No `Request` objects, no response shaping. Plain data in, plain data out.

**Rule 3 — Repositories only do data access**
`features/*/repository.py` only queries and returns data. No business logic, no decisions. Complex queries — aggregations, window functions, CTEs — belong here, not in service.

**Rule 4 — API is versioned from day one**
All routes live under `/api/v1/`. Breaking changes get a `/api/v2/` alongside. Mobile users who haven't updated yet keep working without interruption.

**Rule 5 — One Supabase client, injected everywhere**
`core/database.py` creates the client once. `api/deps.py` injects it via FastAPI dependency injection. Nothing instantiates its own client.

**Rule 6 — Auth is Supabase JWT — no custom auth**
Frontend sends a Supabase JWT in every request header. `core/security.py` verifies it via Supabase's public key. No custom session management.

**Rule 7 — Environment variables are typed and validated at startup**
`core/config.py` uses Pydantic `BaseSettings`. Every required env var is declared as a typed field. Missing var = immediate crash on startup, not a silent runtime failure.

---

## Database Schema

### Tables

```sql
-- Users (extends Supabase auth.users)
CREATE TABLE users (
  id                UUID PRIMARY KEY REFERENCES auth.users(id),
  name              TEXT,
  currency          TEXT DEFAULT 'INR',
  budget_reset_day  INT DEFAULT 1,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Categories (system defaults + user custom)
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),   -- NULL = system default
  name        TEXT NOT NULL,
  emoji       TEXT NOT NULL,
  color       TEXT NOT NULL,               -- Hex color string
  is_system   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Transactions
CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  amount            NUMERIC(12,2) NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('debit', 'credit')),
  merchant          TEXT NOT NULL,
  category_id       UUID REFERENCES categories(id),
  note              TEXT,
  detected_via      TEXT CHECK (
                      detected_via IN ('sms', 'upi', 'manual', 'scan')
                    ),
  receipt_url       TEXT,                  -- Supabase Storage URL
  transaction_date  DATE NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  synced_at         TIMESTAMPTZ
);

-- Budgets
CREATE TABLE budgets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  category_id  UUID REFERENCES categories(id),  -- NULL = overall budget
  amount       NUMERIC(12,2) NOT NULL,
  period       TEXT DEFAULT 'monthly',
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Budget Periods (tracks actual spend per period)
CREATE TABLE budget_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id     UUID NOT NULL REFERENCES budgets(id),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  spent_amount  NUMERIC(12,2) DEFAULT 0
);
```

---

### Row Level Security

RLS is enabled on every table. Enforced at the Postgres level — not just in application code. User A can never access User B's data even if the application layer has a bug.

```sql
-- Enable RLS on all tables
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_periods ENABLE ROW LEVEL SECURITY;

-- Transactions — own rows only
CREATE POLICY "own transactions only"
ON transactions FOR ALL
USING (user_id = auth.uid());

-- Budgets — own rows only
CREATE POLICY "own budgets only"
ON budgets FOR ALL
USING (user_id = auth.uid());

-- Categories — own custom + all system defaults
CREATE POLICY "own and system categories"
ON categories FOR SELECT
USING (user_id = auth.uid() OR is_system = true);

-- Budget periods — via budget ownership
CREATE POLICY "own budget periods only"
ON budget_periods FOR ALL
USING (
  budget_id IN (
    SELECT id FROM budgets WHERE user_id = auth.uid()
  )
);
```

---

> _Document maintained as part of project planning. Last brainstormed with Claude, April 2026._
