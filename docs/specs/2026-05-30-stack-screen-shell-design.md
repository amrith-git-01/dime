# Stack screen shell — design spec

**Date:** 2026-05-30  
**Status:** Approved for implementation planning  
**Scope:** Stack-pushed screens in `MainStackNavigator` only (not tab roots, not auth/onboarding)

---

## Problem

Stack screens repeat the same body chrome:

- `KeyboardAwareScrollView` with `colors.pageBackground`
- `paddingHorizontal: spacing.lg`, `paddingTop: spacing.lg`
- Bottom padding including safe-area inset
- `keyboardShouldPersistTaps="handled"`

Header chrome is duplicated six times in `MainStackNavigator` (`headerTintColor`, `headerStyle`, `headerShadowVisible`).

Some stack routes incorrectly wrap content in `TabScreenShell` (meant for tab roots under `AppHeader`), causing inconsistent layout.

## Goal

Introduce a single **`StackScreenShell`** layout component so stack screens only supply their inner content. Centralize stack header `screenOptions` in one place. Keep React Navigation’s native back arrow and title (no custom header in v1).

## Non-goals (v1)

- Tab screens (Home, Budget, Transactions, Analytics)
- Custom in-app header replacing React Navigation
- Auth / onboarding (`ScreenContainer` unchanged)
- Loading skeletons owned by the shell (lazy hosts and per-screen skeletons stay as-is)
- `variant="static"` or passthrough scroll modes (deferred unless a screen cannot use scroll)

---

## Decisions (brainstorming)

| Topic | Choice |
| --- | --- |
| Screen scope | Stack-pushed only |
| Header | React Navigation native header |
| Body layout | Keyboard-aware scroll only (default) |
| Transaction detail | Wrap in same scroll shell (short content is fine) — option **3b** |

---

## Architecture

### `StackScreenShell`

**Path:** `frontend/src/components/layout/StackScreenShell.tsx`

**Responsibility:** Body wrapper only. No navigation, no title, no back button.

**Implementation:**

- Root: `KeyboardAwareScrollView` from `react-native-keyboard-controller`
- `style`: `{ flex: 1, backgroundColor: colors.pageBackground }`
- `contentContainerStyle`: base padding + optional merge from prop
  - `paddingHorizontal: spacing.lg`
  - `paddingTop: spacing.lg`
  - `paddingBottom: spacing.xl + insets.bottom` via `useSafeAreaInsets()`
  - `flexGrow: 1` (matches `ManualAddTransactionScreen` so short forms still fill height when needed)
- `keyboardShouldPersistTaps="handled"`
- `showsVerticalScrollIndicator={false}` (default)
- `bottomOffset={24}` (default; matches manual add)

**Public API:**

```ts
type StackScreenShellProps = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bottomOffset?: number;
  showsVerticalScrollIndicator?: boolean;
};
```

Screens pass forms, cards, and field groups as `children` only.

### Navigator

**File:** `frontend/src/navigation/MainStackNavigator.tsx`

Extract shared options:

```ts
const stackScreenOptions: NativeStackNavigationOptions = {
  headerShown: true,
  headerTintColor: colors.primary,
  headerStyle: { backgroundColor: colors.pageBackground },
  headerShadowVisible: false,
};
```

Apply via `screenOptions={stackScreenOptions}` on `Stack.Navigator`. Per-screen `options` only set `title` (and dynamic title for `EditMonthlyBudget`).

`contentStyle: { backgroundColor: colors.pageBackground }` on navigator remains.

---

## Migration matrix

| Screen | Current body | Action |
| --- | --- | --- |
| `CreateCustomCategoryScreen` | Local `KeyboardAwareScrollView` + insets | Replace with `StackScreenShell`; remove local scroll styles |
| `EditMonthlyBudgetScreen` | Same | Same |
| `ManualAddTransactionScreen` | Local scroll + `flexGrow`, `bottomOffset` | Replace with shell defaults; remove duplicate styles |
| `SettingsScreen` | `TabScreenShell` + `ScrollView` | `StackScreenShell` only; remove `TabScreenShell` and inner `ScrollView` |
| `NotificationsScreen` | `TabScreenShell` + empty `View` | `StackScreenShell` with placeholder/minimal children |
| `TransactionDetailScreen` | `TabScreenShell` + padded `View` | `StackScreenShell`; `TransactionDetailBody` as child |

**Do not change:** `MainTabs`, lazy host pattern, `LazyScreenFallback`.

---

## Screen pattern (after migration)

```tsx
export default function ExampleStackScreen() {
  // hooks, mutations, handlers unchanged

  return (
    <StackScreenShell>
      {/* screen-specific UI only */}
    </StackScreenShell>
  );
}
```

Title and back behavior stay in navigator `options` / system header.

---

## Files to touch (implementation)

| File | Change |
| --- | --- |
| `frontend/src/components/layout/StackScreenShell.tsx` | **Create** |
| `frontend/src/navigation/MainStackNavigator.tsx` | Shared `stackScreenOptions` |
| `frontend/src/screens/categories/CreateCustomCategoryScreen.tsx` | Adopt shell |
| `frontend/src/screens/budget/EditMonthlyBudgetScreen.tsx` | Adopt shell |
| `frontend/src/screens/transactions/ManualAddTransactionScreen.tsx` | Adopt shell |
| `frontend/src/screens/settings/SettingsScreen.tsx` | Adopt shell; drop tab shell + scroll |
| `frontend/src/screens/notifications/NotificationsScreen.tsx` | Adopt shell |
| `frontend/src/screens/transactions/TransactionDetailScreen.tsx` | Adopt shell |

Optional: export from `frontend/src/components/layout/index.ts` if a barrel exists; otherwise direct imports.

---

## Testing checklist

Manual QA on device/simulator:

1. **Custom category** — keyboard clears fields; bottom padding above home indicator; back pops stack.
2. **Edit monthly budget** — sliders/inputs and save; keyboard does not cover primary actions.
3. **Manual add transaction** — amount field, category grid, keyboard offset behavior unchanged vs before.
4. **Settings** — single scroll, sign out button reachable; no double grey/white background glitch.
5. **Notifications** — shell renders; header back works.
6. **Transaction detail** — body scrolls if needed; padding matches other stack screens.
7. **Header consistency** — all six stack screens: violet back chevron, page background header, no shadow.

---

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Nested scroll if a child adds its own `ScrollView` | Audit migrated screens; only top-level shell scrolls |
| Settings content was in `ScrollView` inside tab shell | Flatten to shell children; one scroll container |
| Detail screen feels odd in scroll | Accept for v1; add `variant="static"` only if UX feedback requires it |

---

## Future (out of v1)

- Custom header in shell (`headerShown: false` globally)
- Tab screen unification (separate spec)
- Shell-level `loading` slot or skeleton prop
- `variant="static"` / `variant="passthrough"` for FlashList-heavy stack screens

---

## Approval record

Brainstorming decisions confirmed by product owner on 2026-05-30: stack-only scope, RN header, scroll-only body, transaction detail via scroll shell (3b).
