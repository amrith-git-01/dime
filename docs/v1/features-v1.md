# 🚀 V1 Features — Expense Tracker App

> **Version:** 1.0.0  
> **Target Users:** Indian Android users who make UPI/digital payments  
> **Development Timeline:** 8-10 weeks (solo dev)  
> **Core Value Proposition:** Automatic expense tracking with zero manual effort  
> **Last Updated:** May 2026

---

## 📋 Table of Contents

1. [V1 Philosophy](#v1-philosophy)
2. [Feature Priority Framework](#feature-priority-framework)
3. [Must-Have Features](#must-have-features-core-v1)
4. [Should-Have Features](#should-have-features-v11)
5. [Could-Have Features](#could-have-features-v2-territory)
6. [Won't-Have Features](#wont-have-features-anti-features)
7. [User Flows](#user-flows)
8. [Success Metrics](#success-metrics)
9. [Feature Implementation Order](#feature-implementation-order)

---

## V1 Philosophy

### What V1 Is
- **Proof of core value:** Automatic expense detection via SMS/UPI that actually works
- **Offline-first:** Works perfectly without internet, syncs when available
- **Privacy-focused:** All AI processing on-device, user data never leaves their control
- **Delightfully simple:** 4 tabs, zero learning curve, obvious interactions

### What V1 Is Not
- ❌ A complete personal finance suite (no investments, bill splitting, loan tracking)
- ❌ A budgeting framework you need to learn (no envelope method, no zero-based budgeting)
- ❌ A bank replacement (no account linking, no live balance)
- ❌ A feature-complete app (intentionally minimal to ship fast)

### V1 Success Criteria
- User can install app and see their first auto-detected expense within 60 seconds
- 80%+ of UPI transactions are captured automatically without user intervention
- App feels faster and more polished than any competitor
- Users describe it as "magical" when auto-detection works

---

## Feature Priority Framework

We use **MoSCoW prioritization:**

| Priority | Meaning | V1 Decision |
|---|---|---|
| **Must Have** | Core value prop, app is useless without this | Ship in V1.0 |
| **Should Have** | Enhances experience, not critical | Ship in V1.1 if time permits |
| **Could Have** | Nice to have, clear V2 material | Defer to V2 |
| **Won't Have** | Explicitly rejected, scope creep risk | Never build |

---

## Must-Have Features (Core V1)

These are **non-negotiable**. V1 doesn't ship without all of these working end-to-end.

---

### 1. Automatic Expense Detection

**Job to be done:** *"Capture my UPI payments without me lifting a finger."*

#### User-Facing Behavior
- App runs a background service that listens for:
  - Bank SMS messages (debit/credit alerts)
  - UPI app notifications (GPay, PhonePe, Paytm)
- When payment detected (within 2 seconds):
  - Bottom sheet slides up from bottom
  - Shows: merchant name, amount, suggested category, payment method
  - User can confirm (tap ✓) or reject (tap ✕)
  - Auto-dismisses after 8 seconds if no interaction
- Confirmed transaction appears in list immediately
- Rejected transaction is discarded (not saved)

#### Technical Implementation
- `NotificationListenerService` for UPI app notifications
- Broadcast receiver for SMS (requires `READ_SMS` permission)
- Regex patterns for top 10 Indian banks (HDFC, ICICI, SBI, Axis, Kotak, etc.)
- Gemma 4 E2B cleans up merchant names:
  - Input: `"SWGY*SWIG9381 BANGALORE"`
  - Output: `"Swiggy"`
- Bottom sheet component with 8-second countdown timer
- Saves to WatermelonDB on confirm

#### Edge Cases
- **Permission denied:** Show persistent card on Home screen explaining auto-detection requires SMS permission, with CTA to grant
- **Malformed SMS:** Falls back to showing raw text, lets user edit manually
- **Duplicate detection:** If same amount + merchant within 5 minutes, ask user "Is this a duplicate?"
- **Low battery:** System may kill background service — show subtle warning if service hasn't run in 6+ hours
- **No network:** AI categorization queued, runs when online (transaction still saved)

#### Acceptance Criteria
- [ ] Detects HDFC, ICICI, SBI, Axis bank SMS within 2 seconds
- [ ] Detects GPay, PhonePe UPI notifications within 2 seconds
- [ ] Bottom sheet appears smoothly (spring animation, no jank)
- [ ] Merchant name cleanup works for top 20 merchants (Swiggy, Zomato, Amazon, Flipkart, etc.)
- [ ] Auto-categorization accuracy >80% for common merchants
- [ ] Works when app is closed (background service)
- [ ] Works in airplane mode (AI runs on-device)

---

### 2. Manual Expense Logging

**Job to be done:** *"Add cash expenses or transactions that weren't auto-detected."*

#### User-Facing Behavior
- FAB (Floating Action Button) visible on Home and Transactions screens
- Tap FAB → bottom sheet slides up with form:
  - **Amount** (number input, opens numpad, required)
  - **Category** (grid of 10 icon buttons, required, defaults to last used)
  - **Merchant** (text input with autocomplete from past merchants, required)
  - **Date** (date picker, defaults to today, optional to change)
  - **Note** (text input, optional, placeholder: "Add a note...")
  - **Type** (toggle: Debit / Credit, defaults to Debit)
- Save button at bottom (disabled if amount/category/merchant missing)
- On save:
  - Bottom sheet dismisses with snap animation
  - Transaction appears at top of list
  - FAB briefly turns into checkmark, then reverts
  - Haptic feedback (success vibration)

#### Technical Implementation
- FAB component with shadow + breathing animation (idle state)
- Bottom sheet with form validation
- Category grid: 2 columns × 5 rows, each cell 64dp × 64dp
- Merchant autocomplete: searches WatermelonDB for past merchants, shows top 5 matches
- Saves to WatermelonDB with `detected_via: 'manual'`

#### Edge Cases
- **User exits before saving:** Bottom sheet dismisses, data discarded (no auto-save)
- **Amount = 0:** Save button stays disabled
- **Merchant name empty:** Save button stays disabled
- **Past midnight:** Date picker defaults to "yesterday" if user opens at 12:30 AM (they're probably logging something from evening)
- **No category selected:** Save button disabled

#### Acceptance Criteria
- [ ] FAB visible and tappable on Home and Transactions screens
- [ ] Form opens in <200ms
- [ ] Numpad appears automatically when sheet opens
- [ ] Category grid scrollable if >10 categories (future-proof)
- [ ] Merchant autocomplete shows results after 2 characters typed
- [ ] Transaction appears in list within 100ms of save
- [ ] Works offline (no API call needed)

---

### 3. Transaction List

**Job to be done:** *"See where my money went."*

#### User-Facing Behavior
- Full-screen scrollable list grouped by date:
  - **Today** (if any)
  - **Yesterday** (if any)
  - **This Week** (Mon-Sun, excluding today/yesterday)
  - **Last Week**
  - **Earlier** (grouped by month: "April 2026", "March 2026", etc.)
- Each transaction row shows:
  - **Left:** Category icon (emoji in colored circle, 40dp diameter)
  - **Center:** 
    - Merchant name (bold, 16sp, text-primary)
    - Time + payment method badge (12sp, text-secondary, e.g., "9:41 PM · UPI")
  - **Right:** Amount (JetBrains Mono, 16sp, right-aligned, red for debit, green for credit)
- Swipe left → reveals red delete button (destructive action)
- Swipe right → reveals blue "Change category" button
- Tap row → opens transaction detail screen
- Pull to refresh → syncs with cloud (if online)
- Empty state: illustration + "No expenses yet" + CTA to add manually

#### Gestures
- **Swipe left (delete):**
  - Drag item left, red background expands from right
  - Trash icon appears
  - If drag >80dp or velocity >500px/s → committed
  - On release: item slides off screen, height collapses, remaining items slide up
  - Snackbar appears: "Deleted" with UNDO button (5 second timeout)
  - If UNDO tapped: item reappears with bounce animation
  
- **Swipe right (recategorize):**
  - Drag item right, blue background expands from left
  - Pencil icon appears
  - If drag >80dp or velocity >500px/s → committed
  - On release: bottom sheet with category picker opens
  - User selects new category → item updates, sheet dismisses

- **Long press:**
  - Haptic feedback after 400ms
  - Item scales down slightly
  - Checkboxes appear on all items (multi-select mode)
  - Action bar appears at top (Delete All, Export CSV — future)
  - Tap outside or press X → exits multi-select

#### Technical Implementation
- FlatList with section headers
- React Native Gesture Handler for swipe gestures
- Reanimated 3 for smooth animations
- WatermelonDB query: `transactions.query(Q.sortBy('transaction_date', Q.desc))`
- Group by date logic in custom `useGroupedTransactions` hook
- Delete uses soft delete flag (can undo from snackbar)

#### Edge Cases
- **No transactions:** Show empty state
- **Offline + pull to refresh:** Show "You're offline" toast
- **Swipe conflict:** Only one item can be swiped at a time (others snap back)
- **Very long merchant name:** Truncate with ellipsis after 20 characters
- **Same merchant, same amount, same day:** Show time to differentiate
- **Deleted item in undo queue:** If user force-quits app, delete is permanent (no persistent undo queue)

#### Acceptance Criteria
- [ ] List renders 1000+ transactions without lag (use FlatList.initialNumToRender optimization)
- [ ] Swipe gestures feel smooth (60fps, no frame drops)
- [ ] Date grouping is correct (Today/Yesterday/This Week logic)
- [ ] Empty state shows when no transactions
- [ ] Pull to refresh shows spinner and syncs
- [ ] Delete → undo flow works correctly
- [ ] Transaction detail screen opens on tap

---

### 4. Home Screen

**Job to be done:** *"At a glance, am I spending too much this month?"*

#### User-Facing Behavior
- **Header:**
  - Greeting: "Good morning, [Name]" (changes: morning/afternoon/evening)
  - Date: "Saturday, May 2"
  
- **Spending Card** (hero element):
  - Total spent this month (large number, ₹ format, JetBrains Mono, 40sp)
  - Budget status subtitle:
    - Under budget: "₹8,520 left to spend" (text-secondary)
    - At budget: "You're at your budget" (warning color)
    - Over budget: "₹1,200 over budget" (danger color)
  - Spending ring (arc, animates from 0° to current % on screen load):
    - 0-79%: primary color
    - 80-99%: warning color (smooth transition)
    - 100%+: danger color + shake animation once
  - Tap card → opens Budgets tab
  
- **Top Categories** (horizontal scrollable chips):
  - Shows top 5 categories by spending this month
  - Each chip: emoji icon + "Food ₹3,200" (category name + amount)
  - Tap chip → filters Transactions tab by that category
  
- **Recent Transactions:**
  - Section header: "Recent" with "See all →" link
  - Last 5 transactions (compact, same layout as main list)
  - Tap "See all" → switches to Transactions tab
  
- **FAB:** Visible at bottom-right for quick add

#### Technical Implementation
- Spending card uses Victory Native XL for arc rendering (GPU, silky smooth)
- Arc animation: `strokeDashoffset` transition over 800ms with ease-out curve
- Budget data from Zustand store (hydrated from WatermelonDB on app launch)
- Top categories: query WatermelonDB, aggregate by category, sort desc, take top 5
- Recent transactions: simple query with limit(5)
- Greeting logic: `new Date().getHours()` → morning (5-11), afternoon (12-17), evening (18-4)

#### Edge Cases
- **No budget set:** Spending card shows "Set a budget" CTA instead of ring
- **No transactions yet:** Empty state with onboarding prompt
- **First day of month:** Shows "₹0 spent" (not "No data")
- **User name not set:** Defaults to "Good morning" (no name)
- **Offline:** All data loads from local DB, no spinner, no "offline" banner (it just works)

#### Acceptance Criteria
- [ ] Spending ring animates smoothly on screen mount
- [ ] Budget status text updates correctly (under/at/over)
- [ ] Top categories scrollable horizontally
- [ ] Tapping category chip filters Transactions tab
- [ ] Recent transactions shows last 5, sorted by date desc
- [ ] FAB animates on press (scale down, snap back)
- [ ] Screen loads in <100ms (all local data, no network)

---

### 5. AI Auto-Categorization

**Job to be done:** *"Stop asking me if Swiggy is food — the app should just know."*

#### User-Facing Behavior
- When transaction detected (SMS/UPI):
  - Gemma 4 E2B suggests category based on merchant name
  - Shown in bottom sheet: "Swiggy → 🍔 Food & Dining"
  - User can tap category to change (opens picker)
  - If user changes, app learns (stores merchant → category mapping locally)
- When manually logging:
  - As user types merchant name, AI suggests category in real-time
  - Category button auto-selects suggested category (user can override)
- Fallback to "📦 Others" if AI is uncertain (confidence <70%)

#### How AI Works
- Uses Gemma 4 E2B via ML Kit GenAI Prompt API
- Prompt template:
  ```
  Categorize this expense:
  Merchant: "{merchant_name}"
  Amount: ₹{amount}
  
  Categories:
  - 🍔 Food & Dining
  - 🚗 Transport
  - 🛍️ Shopping
  - 💊 Health
  - 🎬 Entertainment
  - 💡 Utilities
  - ✈️ Travel
  - 📚 Education
  - 📦 Others
  
  Return only the category emoji and name, nothing else.
  If uncertain, return "📦 Others".
  ```
- Response parsed, matched against category list
- First run: AI downloads model (~1.3 GB, one-time, shows progress dialog)
- Runs on-device, works offline, zero cost

#### Learning System
- Local SQLite table: `merchant_category_mappings`
- Schema: `merchant_name (text), category_id (uuid), confidence (int), user_corrected (bool)`
- When user changes category:
  - Insert/update mapping with `user_corrected = true`
  - This mapping takes precedence over AI suggestion for future
- Example: User changes "Uber" from Transport → Food (maybe Uber Eats)
  - Next time "Uber" appears, auto-suggests Food

#### Technical Implementation
- ML Kit GenAI API integration in `features/ai/`
- Custom hook: `useCategorize(merchantName: string)`
- Returns: `{ category, confidence, loading }`
- Caching: recent categorizations cached in memory (LRU cache, max 100 entries)
- Timeout: if AI takes >3 seconds, fallback to "Others" (show "AI is slow" toast)

#### Edge Cases
- **AI model not downloaded yet:** Show "Downloading AI model... 45%" dialog, allow user to cancel and categorize manually
- **Device too old (no AICore):** Fallback to rule-based categorization (merchant name contains "swiggy|zomato" → Food)
- **Network down + model not cached:** Use last-known category for merchant, or default to "Others"
- **Ambiguous merchant:** AI returns "📦 Others" → user must categorize manually
- **User repeatedly changes AI suggestions:** After 3 corrections for same merchant, stop auto-suggesting (always default to last user choice)

#### Acceptance Criteria
- [ ] AI categorization accuracy >80% for top 50 merchants
- [ ] Categorization completes in <1 second on Snapdragon 8 Gen 1+
- [ ] Works offline after first model download
- [ ] User corrections persist and override AI
- [ ] Fallback to "Others" when confidence low
- [ ] Model download progress shown clearly
- [ ] Graceful degradation on old devices (rule-based fallback)

---

### 6. Basic Budget Tracking

**Job to be done:** *"Keep me from overspending this month."*

#### User-Facing Behavior
- **Onboarding:** During first launch, user sets monthly budget (e.g., ₹25,000)
- **Home screen:** Spending ring shows % of budget used
- **Budget warning notification:**
  - 80% reached: "You've used ₹20,000 of your ₹25,000 budget"
  - 100% reached: "Budget exceeded! You're ₹500 over."
- **Settings:** User can change budget amount anytime
- **Reset:** Budget auto-resets on 1st of every month (hardcoded for V1)

#### How It Works
- One monthly budget stored in WatermelonDB `budgets` table
- Budget amount (e.g., ₹25,000)
- Period: monthly (only option in V1)
- Reset day: 1st of month (only option in V1)
- Spent calculation: sum of all debits in current month
- Remaining: budget - spent

#### Notifications
- **80% threshold:**
  - Local notification: "Budget Alert: 80% used"
  - Only fires once per month (don't spam)
  - Tapping notification opens app to Home screen
  
- **100% threshold:**
  - Local notification: "Budget exceeded!"
  - Fires once when crossed, plus daily reminder if still over
  - Tapping opens Home screen

#### Technical Implementation
- Budget stored in Zustand `useBudgetStore` (hydrated from WatermelonDB)
- Notification scheduling: `expo-notifications`
- Check on every transaction save: if new total crosses threshold, fire notification
- Home screen ring color changes based on %:
  - 0-79%: `color.primary`
  - 80-99%: `color.warning` (smooth gradient transition)
  - 100%+: `color.danger` + shake animation

#### Edge Cases
- **No budget set:** Home screen shows "Set a budget" CTA (opens budget setup sheet)
- **Budget = 0:** Treated as "no budget set"
- **Mid-month budget change:** If user changes budget from ₹25k → ₹30k, notification thresholds recalculate (don't re-fire if already sent)
- **Timezone change:** Budget resets at midnight in device's current timezone
- **Credits/refunds:** Reduce spent amount (if refund in same month, frees up budget)

#### Acceptance Criteria
- [ ] User can set budget during onboarding
- [ ] User can change budget in Settings
- [ ] Spending ring updates in real-time as transactions added
- [ ] 80% notification fires exactly once per month
- [ ] 100% notification fires when threshold crossed
- [ ] Budget resets on 1st of month at midnight
- [ ] Credits/refunds reduce spent amount correctly

---

### 7. Local-First Data (WatermelonDB)

**Job to be done:** *"App should work perfectly on the metro with no signal."*

#### User-Facing Behavior
- App works 100% offline, always
- No loading spinners (data is local)
- No "You're offline" banners (offline is the default, online is a bonus)
- Sync happens silently in background when connected
- Sync status: tiny dot in top-right of Home screen
  - Green: synced
  - Yellow: syncing
  - Red: offline >24 hours (tap for details)

#### How It Works
- All data stored in SQLite via WatermelonDB
- Tables: `transactions`, `budgets`, `categories`, `merchant_mappings`
- Reactive: UI updates automatically when data changes (WatermelonDB observers)
- No API calls required for reads/writes (instant)
- Sync layer: separate background process (see Feature #9)

#### Technical Implementation
- WatermelonDB models in `src/db/models/`
- Schema in `src/db/schema.ts`
- App initialization: `await database.write(() => { /* seed default categories */ })`
- All screens use WatermelonDB `observe()` pattern:
  ```tsx
  const transactions = useDatabase().collections.get('transactions').query().observe()
  ```
- Changes propagate via RxJS observables → Zustand → React re-renders

#### Edge Cases
- **First launch:** Seed 10 default categories (Food, Transport, etc.)
- **Database corruption:** Detect on launch, show "Data corrupted, reset required?" dialog
- **Migration needed:** WatermelonDB handles schema migrations automatically
- **Large dataset:** Database limited to 10,000 transactions max (archive older to cloud, keep last 2 years local)

#### Acceptance Criteria
- [ ] App launches in <500ms (database connection instant)
- [ ] Transactions list renders 1000+ items without lag
- [ ] All CRUD operations complete in <50ms
- [ ] UI updates reactively when data changes
- [ ] Works in airplane mode (no crashes, no errors)
- [ ] Database migrations run successfully on schema changes

---

### 8. Onboarding Flow

**Job to be done:** *"Understand what this app does and grant necessary permissions."*

#### User-Facing Behavior
- First launch → onboarding (3 screens, swipeable carousel)
  
**Screen 1: Welcome**
- Hero illustration (Lottie animation of phone receiving SMS → expense appearing)
- Headline: "Your expenses, tracked automatically"
- Subtext: "No manual logging. Your bank SMS does the work."
- Button: "Get started"

**Screen 2: Permissions**
- Two permission cards:
  1. **SMS Access**
     - Icon: 💬
     - Title: "Read bank messages"
     - Explain: "We detect payments from your bank SMS. All processing happens on your device."
     - Button: "Grant SMS access"
     - Skip: "I'll do this later" (link)
  
  2. **Notifications Access**
     - Icon: 🔔
     - Title: "Notification access"
     - Explain: "Detects UPI payments from GPay, PhonePe. Required for auto-tracking."
     - Button: "Grant notification access"
     - Skip: "I'll do this later"

**Screen 3: Set Budget**
- Headline: "How much do you want to spend monthly?"
- Big number input: ₹ [___]
- Presets: ₹10k, ₹20k, ₹30k, ₹50k (tap to auto-fill)
- Button: "Start tracking"
- Skip: "Skip for now" (defaults to ₹25,000)

**After onboarding:**
- Navigate to Home screen
- Show bottom sheet: "Try adding your first expense!" (points to FAB)
- Dismiss after 5 seconds or user interaction

#### Technical Implementation
- Three screens in `src/screens/Onboarding/`
- Horizontal FlatList with snap-to-page
- Dot indicators at bottom (active dot highlighted)
- State managed in `useOnboardingStore` (Zustand)
- Permissions requested via `expo-permissions`
- On completion: set `hasCompletedOnboarding: true` in MMKV
- Next launch: skip onboarding, go straight to Home

#### Edge Cases
- **Permissions denied:** App works, but shows persistent banner on Home: "Enable auto-tracking" with CTA
- **User skips budget:** Defaults to ₹25,000, can change later in Settings
- **User exits mid-onboarding:** Progress saved, resumes where they left off
- **Already granted permissions (reinstall):** Skip permission screens, just show budget screen

#### Acceptance Criteria
- [ ] Onboarding shows on first launch only
- [ ] Can swipe between screens smoothly
- [ ] Dot indicators show current screen
- [ ] SMS permission request dialog appears when "Grant" tapped
- [ ] Notification permission request appears when "Grant" tapped
- [ ] Budget value persists to database
- [ ] Onboarding dismisses correctly, never shows again
- [ ] Skip buttons work, don't break flow

---

### 9. Cloud Sync (Background)

**Job to be done:** *"My data should survive app reinstall or phone upgrade."*

#### User-Facing Behavior
- Sync happens automatically in background (user doesn't trigger it)
- Sync frequency:
  - Every 5 minutes when app is open and online
  - On app foreground (user returns to app)
  - On pull-to-refresh in Transactions list
- Sync status indicator (top-right of Home screen):
  - Tiny dot (8dp diameter)
  - Green: all data synced
  - Yellow: syncing in progress (animated pulse)
  - Red: offline >24 hours or sync error
  - Tap dot → shows sync details sheet:
    - "Last synced: 2 minutes ago"
    - "15 transactions pending upload"
    - Button: "Sync now"
- No "syncing..." full-screen loaders (sync is silent)
- Conflicts resolved automatically (last-write-wins for V1)

#### How It Works
- Background service syncs local WatermelonDB → Supabase Postgres
- Two-way sync:
  - **Upload:** Local changes (new/updated/deleted transactions) → POST to FastAPI → Supabase
  - **Download:** Cloud changes → GET from FastAPI → merge into WatermelonDB
- Conflict resolution (V1 simple strategy):
  - Last-write-wins based on `updated_at` timestamp
  - No manual conflict UI (auto-resolve)
- Sync queue:
  - Pending changes stored in `sync_queue` table
  - Retries failed syncs (exponential backoff, max 3 attempts)
  - If sync fails 3 times, mark as error, show red dot

#### Technical Implementation
- Sync service in `src/features/sync/`
- Uses WatermelonDB sync adapter
- FastAPI endpoints:
  - `POST /api/v1/sync/push` (upload local changes)
  - `GET /api/v1/sync/pull?last_synced_at={timestamp}` (download cloud changes)
- Sync triggered by:
  - `useEffect` on Home screen mount (every 5 min interval)
  - `AppState` change listener (foreground)
  - Pull-to-refresh gesture
- Authentication: Supabase JWT in header (from `useAuthStore`)

#### Edge Cases
- **No internet:** Sync queued, happens when connection restored (app shows green dot → red dot)
- **Auth token expired:** Refresh token, retry sync
- **Sync conflict:** Last-write-wins (example: user edits transaction on phone A, also on phone B, whichever saves last wins)
- **Large sync (1000+ transactions):** Paginate in batches of 100, show progress in sync details sheet
- **Partial sync failure:** Some transactions sync, some fail → retry failed ones only
- **User reinstalls app:** On login, full download from cloud → populates local DB

#### Acceptance Criteria
- [ ] Sync happens every 5 minutes when app open + online
- [ ] Sync triggers on app foreground
- [ ] Pull-to-refresh triggers immediate sync
- [ ] Sync status dot updates correctly (green/yellow/red)
- [ ] Tapping dot shows sync details sheet
- [ ] Conflicts resolve automatically (last-write-wins)
- [ ] Sync queue persists across app restarts
- [ ] Failed syncs retry with exponential backoff
- [ ] Full sync completes in <10 seconds for 1000 transactions

---

### 10. Settings Screen

**Job to be done:** *"Control the app's behavior and manage my data."*

#### User-Facing Behavior
- Accessible from Home screen (gear icon in top-right)
- Grouped settings:

**Account**
- Profile name (tap to edit)
- Email (read-only, from Supabase Auth)
- Logout button (red, confirms before logout)

**Budget**
- Monthly budget amount (tap to edit, opens number input)
- Budget reset day (locked to "1st of month" in V1, grayed out)

**Auto-Detection**
- Toggle: "Detect SMS transactions" (on/off)
- Toggle: "Detect UPI notifications" (on/off)
- Subtext: "Disable if you don't want automatic tracking"

**Privacy**
- "All processing happens on your device"
- "Your data is never sold or shared"
- Link: "Privacy Policy" (opens web view)

**Data**
- "Last synced: 5 minutes ago" (read-only status)
- Button: "Sync now" (force sync)
- Button: "Clear all data" (red, confirms: "This will delete all transactions. Are you sure?")

**About**
- App version (e.g., "1.0.0")
- Link: "Terms of Service"
- Link: "Open source licenses"
- "Made with ❤️ in India"

#### Technical Implementation
- Settings screen: `src/screens/Settings/SettingsScreen.tsx`
- Uses MMKV for preferences (auto-detection toggles)
- Budget stored in WatermelonDB (same as Feature #6)
- Logout: clears Zustand stores, clears MMKV, clears WatermelonDB, navigates to auth screen
- Clear all data: deletes all WatermelonDB records, resets to onboarding

#### Edge Cases
- **Toggle auto-detection off:** Background service stops, user must log manually
- **Change budget mid-month:** Recalculates % used, doesn't reset spending
- **Logout while offline:** Queue logout, sync pending changes first (or warn: "You have unsynced data, sync before logout?")
- **Clear data while offline:** Confirm: "This will delete local data. Cloud backup not affected."

#### Acceptance Criteria
- [ ] Settings screen accessible from Home
- [ ] Profile name editable (saves to Supabase)
- [ ] Budget amount editable (updates immediately)
- [ ] Auto-detection toggles work (stop/start background service)
- [ ] Logout clears all local data
- [ ] Clear data deletes all transactions (after confirmation)
- [ ] Sync status shows last sync time
- [ ] "Sync now" triggers immediate sync

---

## Should-Have Features (V1.1)

These enhance V1 but aren't critical. Ship if time permits in first release, otherwise V1.1 update.

---

### 11. Category-Level Budgets

**Job to be done:** *"I want to limit food spending to ₹5,000/month separately."*

#### User-Facing Behavior
- Budgets tab (new, 4th tab in bottom navigation)
- Shows list of category budgets (cards):
  - Category icon + name
  - Progress bar (spent / total)
  - "₹3,200 / ₹5,000 spent"
- Tap "Add budget" → opens sheet:
  - Select category
  - Enter budget amount
  - Save
- Tap existing budget → edit amount or delete
- Warnings work same as overall budget (80%, 100% notifications)

#### Technical Implementation
- `budgets` table already exists (schema supports category_id)
- Query budgets with category join
- Aggregate spent per category per month
- Progress bar component (reusable)

#### Acceptance Criteria
- [ ] User can create budget per category
- [ ] Progress bars show correctly
- [ ] Notifications fire at 80% and 100% per category
- [ ] Budgets reset on 1st of month

---

### 12. Receipt Scanning

**Job to be done:** *"I don't want to type amounts from paper receipts."*

#### User-Facing Behavior
- FAB → "Scan Receipt" option (opens camera)
- User captures photo
- AI extracts: merchant, amount, date, line items
- Shows preview: "Detected: Reliance Fresh, ₹1,245"
- User confirms or edits
- Receipt image uploaded to DO Spaces
- Thumbnail shown in transaction detail

#### Technical Implementation
- Gemma 4 multimodal (image + text input)
- Image upload to DO Spaces via FastAPI
- Receipt URL stored in `transactions.receipt_url`

#### Acceptance Criteria
- [ ] Camera opens smoothly
- [ ] AI extracts data >70% accuracy
- [ ] Receipt image stored in cloud
- [ ] Viewable in transaction detail

---

### 13. Basic Insights (Charts)

**Job to be done:** *"Show me my spending patterns."*

#### User-Facing Behavior
- Insights tab (replaces Budgets if #11 not built)
- Three charts:
  1. **Donut chart:** Spending by category (this month)
  2. **Line chart:** Daily spending (last 30 days)
  3. **Bar chart:** Month-over-month comparison (last 6 months)
- Tap chart segment → filters transactions

#### Technical Implementation
- Victory Native XL for all charts
- Data from WatermelonDB aggregations
- Charts render on GPU (smooth 60fps)

#### Acceptance Criteria
- [ ] Charts load in <500ms
- [ ] Animations smooth (no jank)
- [ ] Tapping filters transactions
- [ ] Works offline (local data)

---

### 14. Search & Filters

**Job to be done:** *"Find that Amazon order from last week."*

#### User-Facing Behavior
- Search bar at top of Transactions screen
- Search by merchant name or amount
- Filters button → sheet with:
  - Date range picker
  - Category multi-select
  - Type (Debit/Credit/Both)
- Results update in real-time

#### Technical Implementation
- WatermelonDB query with `Q.where()` conditions
- Search debounced (300ms)

#### Acceptance Criteria
- [ ] Search returns results in <100ms
- [ ] Filters apply correctly
- [ ] Clear filters button resets

---

### 15. Transaction Notes (Text)

**Job to be done:** *"Remember why I made this payment."*

#### User-Facing Behavior
- Optional note field in manual entry form
- Shows in transaction detail below amount
- Max 200 characters

#### Technical Implementation
- `transactions.note` column (already in schema)
- Simple text input

#### Acceptance Criteria
- [ ] Note saves and displays
- [ ] Works in auto-detected transactions (editable)

---

## Could-Have Features (V2 Territory)

Explicitly **deferred to V2**. Don't build these in V1.

### 16. Recurring Transaction Detection
- AI detects patterns (e.g., Netflix every month)
- Suggests creating recurring entry

### 17. Bill Reminders
- "Electricity bill due in 3 days"
- Notifications + calendar integration

### 18. Multi-Currency Support
- Switch between ₹ / $ / €
- Exchange rate conversion

### 19. Export Data
- Export to CSV, PDF, Excel
- Email or share as file

### 20. Dark Mode
- System-aware theme switching
- (Easy with NativeWind, but not priority)

### 21. Android Widgets
- Home screen widget showing spending
- Quick-add expense widget

### 22. Voice Notes
- Audio memo attached to transaction
- Stored in DO Spaces

### 23. Shared Budgets
- Family accounts, shared expenses
- Multi-user sync

### 24. Income Tracking
- Separate tab for income vs expenses
- Net cash flow calculation

### 25. Goals / Savings Targets
- "Save ₹50,000 for vacation"
- Progress tracking

---

## Won't-Have Features (Anti-Features)

Explicitly **rejected**. Not in V1, V2, or ever (unless strategy changes).

### ❌ Bank Account Linking
- **Why not:** Privacy nightmare, regulatory compliance, expensive third-party APIs
- **Alternative:** SMS/UPI auto-detection covers 80% of use cases without invasive access

### ❌ Investment Tracking
- **Why not:** Different product category, different user persona, needs live market data
- **Alternative:** Let users use Zerodha/Groww for investments, we focus on expenses

### ❌ Bill Splitting / Group Expenses
- **Why not:** Splitwise exists and does this well, adds social layer complexity
- **Alternative:** Users can manually log their share of split bills

### ❌ Gamification (Points, Streaks, Badges)
- **Why not:** Finance apps should be utility-first, not engagement-hacking
- **Alternative:** Focus on clarity and speed, not artificial retention

### ❌ Cryptocurrency Tracking
- **Why not:** Volatile, regulatory unclear in India, niche audience
- **Alternative:** N/A

### ❌ Loan/EMI Tracking
- **Why not:** Complex amortization logic, different mental model than expenses
- **Alternative:** Could be V3 if user research shows demand

---

## User Flows

### Flow 1: First-Time User (Happy Path)

```
1. Install app from Play Store
2. Open app → Onboarding Screen 1
3. Tap "Get started" → Onboarding Screen 2
4. Tap "Grant SMS access" → Android permission dialog → Allow
5. Tap "Grant notification access" → Android settings → Enable
6. Onboarding Screen 3 → Enter ₹30,000 → Tap "Start tracking"
7. Home screen appears → Bottom sheet: "Try adding your first expense!"
8. Tap FAB → Manual entry sheet opens
9. Enter: ₹250, category Food, merchant "Chai wala"
10. Tap Save → Transaction appears in list
11. [5 minutes later] Bank SMS arrives: "Debited ₹480 at SWIGGY"
12. Bottom sheet appears: "Swiggy → Food & Dining, ₹480"
13. User taps Confirm → Transaction added
14. Home screen spending card updates: ₹730 spent
```

**Success:** User experienced both manual and auto-detection within 10 minutes.

---

### Flow 2: Auto-Detection (SMS)

```
1. User makes UPI payment via GPay: ₹120 to "Ola Cabs"
2. Bank sends SMS: "Debited Rs.120 to OLA CABS..."
3. App's background service intercepts SMS within 2 seconds
4. Regex extracts: amount=120, merchant="OLA CABS", type=debit
5. Gemma 4 cleans merchant name: "OLA CABS" → "Ola"
6. Gemma 4 categorizes: "Ola" → "🚗 Transport"
7. Bottom sheet slides up showing detection
8. User sees notification, opens app
9. Bottom sheet visible: "Ola → Transport, ₹120"
10. User taps Confirm
11. Transaction saved to WatermelonDB
12. Bottom sheet dismisses with animation
13. Transaction appears at top of list
```

**Success:** Zero manual input required. User just confirmed.

---

### Flow 3: Manual Categorization Override

```
1. Auto-detected transaction: "Amazon → Shopping, ₹890"
2. User knows this was a book (not shopping)
3. Swipes transaction right
4. Category picker sheet opens
5. User taps "📚 Education"
6. Sheet dismisses
7. Transaction updates: "Amazon → Education, ₹890"
8. AI learns: merchant_mappings table updated (Amazon → Education, user_corrected=true)
9. Next Amazon purchase: AI auto-suggests Education (learned)
```

**Success:** AI adapts to user's categorization preferences.

---

### Flow 4: Budget Warning

```
1. User has ₹10,000 monthly budget
2. Current spending: ₹7,500 (75%)
3. User adds expense: ₹600
4. New total: ₹8,100 (81%)
5. Threshold crossed: 80%
6. Local notification fires: "Budget Alert: 81% used"
7. User taps notification → App opens to Home screen
8. Spending ring is yellow (warning color)
9. Status text: "₹1,900 left to spend"
```

**Success:** User is aware before overspending.

---

### Flow 5: Offline Usage

```
1. User is on metro (no signal)
2. Opens app → Home screen loads instantly (local data)
3. Taps FAB → Manual entry
4. Adds: ₹40, Transport, "Metro"
5. Saves → Transaction appears immediately
6. Sync status dot: red (offline)
7. User exits metro, signal returns
8. Background sync detects connection
9. Uploads pending transaction to Supabase
10. Sync status dot: green
```

**Success:** App works perfectly offline, syncs when able.

---

## Success Metrics

### V1 Launch Success Criteria

**Technical Metrics:**
- [ ] App launches in <500ms on mid-range device (Snapdragon 778G)
- [ ] Transaction list scrolls at 60fps with 1000+ items
- [ ] Auto-detection latency <2 seconds from SMS received to bottom sheet shown
- [ ] AI categorization accuracy >80% for top 50 merchants
- [ ] App works 100% offline (all core features functional)
- [ ] Crash-free rate >99.5%
- [ ] App size <50 MB (excluding AI model download)

**User Engagement Metrics:**
- [ ] 70%+ of new users complete onboarding
- [ ] 50%+ of users grant SMS permission
- [ ] 40%+ of users grant notification permission
- [ ] Average 3+ transactions logged per user in first week
- [ ] 30%+ of transactions are auto-detected (not manual)
- [ ] Day 7 retention >40%
- [ ] Day 30 retention >20%

**Quality Metrics:**
- [ ] Play Store rating >4.0 stars
- [ ] <5% uninstall rate in first week
- [ ] Support tickets <1 per 100 users

---

## Feature Implementation Order

Recommended build sequence for solo dev (8-10 weeks):

### Week 1-2: Foundation + Manual Logging
1. Bare Expo project setup
2. WatermelonDB schema + models
3. Home screen (basic layout, no charts)
4. Manual expense logging (FAB + bottom sheet + form)
5. Transaction list (FlatList, basic layout, no gestures)
6. Basic navigation (Home ↔ Transactions)

**Milestone:** User can manually log expenses and see them in a list.

---

### Week 3: Visual Polish
7. Apply NativeWind styling to all screens
8. Extract colors to constants
9. Add basic animations (FAB press, bottom sheet slide)
10. Category icons (emoji circles)
11. Empty states

**Milestone:** App looks like a real product, not a prototype.

---

### Week 4: Auto-Detection
12. SMS permission request
13. Background SMS listener
14. Regex patterns for top 5 banks
15. Auto-detect bottom sheet
16. Save auto-detected to DB

**Milestone:** SMS auto-detection works for major banks.

---

### Week 5: AI Integration
17. ML Kit GenAI setup
18. Gemma 4 model download flow
19. Merchant name cleanup
20. Auto-categorization
21. User correction learning system

**Milestone:** AI categorization works, learns from corrections.

---

### Week 6: Budget + Home Screen
22. Budget setup (onboarding + settings)
23. Spending ring (Victory Native XL)
24. Budget calculations
25. Top categories chips
26. Recent transactions section

**Milestone:** Home screen shows complete spending overview.

---

### Week 7: Cloud Sync
27. FastAPI backend (basic CRUD endpoints)
28. Deploy to DigitalOcean
29. Supabase setup (tables, RLS policies)
30. Background sync service
31. Conflict resolution (last-write-wins)

**Milestone:** Data syncs to cloud, survives reinstall.

---

### Week 8: Gestures + Polish
32. Swipe-to-delete
33. Swipe-to-recategorize
34. Pull-to-refresh
35. All animations from design-system.md
36. Skeleton loaders
37. Haptic feedback

**Milestone:** App feels premium, interactions delightful.

---

### Week 9: Settings + Onboarding
38. Settings screen
39. Onboarding flow (3 screens)
40. Permission requests
41. Budget setup in onboarding

**Milestone:** First-time user experience complete.

---

### Week 10: Testing + Bug Fixes
42. Test all flows end-to-end
43. Fix bugs
44. Performance optimization (lazy loading, memoization)
45. Play Store listing (screenshots, description)
46. Beta testing with 10 users

**Milestone:** App is stable and ready to ship.

---

## Notes

- This document is a **living spec** — update as features evolve
- **Priority can shift** based on user feedback during beta
- **V1.1 features** (Should-Have) can be promoted to Must-Have if time permits
- **Scope discipline:** If a feature isn't listed here, it's not in V1

---

> **Remember:** V1 is about **proving the core value** (automatic expense tracking). Everything else is polish. Ship fast, learn fast, iterate.

**Next Steps:**
1. Review this doc with stakeholders (yourself!)
2. Lock Must-Have scope
3. Create GitHub issues from this (one per feature)
4. Start building Week 1-2 features

---

*Last updated: May 2026 · Version 1.0 · Owned by: Solo Dev*
