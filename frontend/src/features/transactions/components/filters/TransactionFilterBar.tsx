import { ChevronDown, ChevronUp, Search, X } from "lucide-react-native";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { useCategories } from "@/features/categories/hooks/useCategories";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

import type { AmountDomain } from "../../utils/amountRange";
import {
  amountFilterLabel,
  buildCategoryOptions,
  countActiveFilters,
  DEFAULT_LIST_CRITERIA,
  describeSelection,
  hasAmountFilter,
  LIST_SORT_LABELS,
  LIST_TYPE_LABELS,
  toggleListCategory,
  toggleListPayee,
  type ListCriteria,
  type PayeeOption,
} from "../../utils/monthListFilter";

import {
  AmountPicker,
  CategoryPicker,
  PayeePicker,
  SortPicker,
  TypePicker,
} from "./FilterPickers";

const SEARCH_DEBOUNCE_MS = 200;
const PANEL_OPEN_MS = 180;
const PANEL_CLOSE_MS = 140;

type FilterId = "type" | "category" | "payee" | "amount" | "sort";

type FilterChipProps = {
  /** The dimension's name ("Category"): shown while the filter is off, and in the labels. */
  name: string;
  /** What the filter is set to; null while off. */
  value: { label: string; spoken: string } | null;
  /** Whether this chip's panel is the one showing under the row. */
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
};

/**
 * Inactive: name + chevron. Active: filled, shows its value, with an ✕ that clears just this
 * filter. Tapping it opens or closes its panel under the row.
 */
const FilterChip = memo(function FilterChip({
  name,
  value,
  open,
  onToggle,
  onClear,
}: FilterChipProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const active = value !== null;
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View style={[styles.chip, active && styles.chipActive, open && styles.chipOpen]}>
      <Pressable
        onPress={() => {
          void triggerHaptic();
          onToggle();
        }}
        style={[styles.chipMain, active && styles.chipMainActive]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          active
            ? `${name} filter, ${value.spoken}, double tap to change`
            : `${name} filter, double tap to choose`
        }
      >
        <Text
          style={[styles.chipText, active && styles.chipTextActive]}
          numberOfLines={1}
        >
          {active ? value.label : name}
        </Text>
        {active ? null : (
          <Chevron size={14} color={colors.inkSoft} strokeWidth={2.25} />
        )}
      </Pressable>
      {active ? (
        <Pressable
          onPress={() => {
            void triggerHaptic();
            onClear();
          }}
          hitSlop={8}
          style={styles.chipClear}
          accessibilityRole="button"
          accessibilityLabel={`Clear ${name.toLowerCase()} filter`}
        >
          <X size={14} color={colors.onAccent} strokeWidth={2.5} />
        </Pressable>
      ) : null}
    </View>
  );
});

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

/**
 * Always-visible search. The list filters as you type, a beat after the last key; a change made
 * from outside (Clear, a link's seed) replaces the text straight away.
 */
const SearchField = memo(function SearchField({ value, onChange }: SearchFieldProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text, SEARCH_DEBOUNCE_MS);
  // The last value this field sent up (or took from outside), to tell its own echo from a real change.
  const synced = useRef(value);

  useEffect(() => {
    if (debounced !== synced.current) {
      synced.current = debounced;
      onChange(debounced);
    }
  }, [debounced, onChange]);

  useEffect(() => {
    if (value !== synced.current) {
      synced.current = value;
      setText(value);
    }
  }, [value]);

  const clear = () => {
    void triggerHaptic();
    setText("");
    synced.current = "";
    onChange("");
  };

  return (
    <View style={styles.search}>
      <Search size={16} color={colors.inkSoft} strokeWidth={2.25} />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Search payee or note"
        placeholderTextColor={colors.inkFaint}
        style={styles.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search payee or note"
      />
      {text.length > 0 ? (
        <Pressable
          onPress={clear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <X size={16} color={colors.inkSoft} strokeWidth={2.25} />
        </Pressable>
      ) : null}
    </View>
  );
});

type FilterPanelProps = {
  /** False while collapsing; the panel then calls `onCollapsed` so its owner can unmount it. */
  open: boolean;
  reduceMotion: boolean;
  onCollapsed: () => void;
  children: ReactNode;
};

/**
 * The picker area under the chip row. Its height follows the content (measured) and its opacity
 * fades with it, so the list below is pushed down and back gently; with reduce motion it just
 * appears and disappears.
 */
function FilterPanel({ open, reduceMotion, onCollapsed, children }: FilterPanelProps) {
  const styles = useStyles();
  const height = useSharedValue(0);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const contentHeight = useSharedValue(0);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    if (open) {
      opacity.value = reduceMotion ? 1 : withTiming(1, { duration: PANEL_OPEN_MS });
      if (contentHeight.value > 0) {
        height.value = reduceMotion
          ? contentHeight.value
          : withTiming(contentHeight.value, { duration: PANEL_OPEN_MS });
      }
      return;
    }
    if (reduceMotion) {
      opacity.value = 0;
      height.value = 0;
      onCollapsed();
      return;
    }
    opacity.value = withTiming(0, { duration: PANEL_CLOSE_MS });
    height.value = withTiming(0, { duration: PANEL_CLOSE_MS }, (finished) => {
      if (finished) runOnJS(onCollapsed)();
    });
  }, [contentHeight, height, onCollapsed, open, opacity, reduceMotion]);

  const onContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const next = event.nativeEvent.layout.height;
      contentHeight.value = next;
      if (!openRef.current) return;
      height.value = reduceMotion ? next : withTiming(next, { duration: PANEL_OPEN_MS });
    },
    [contentHeight, height, reduceMotion],
  );

  const frameStyle = useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.panelFrame, frameStyle]}>
      <View style={styles.panelMeasure} onLayout={onContentLayout}>
        <View style={styles.panel}>{children}</View>
      </View>
    </Animated.View>
  );
}

export type TransactionFilterBarProps = {
  criteria: ListCriteria;
  onCriteriaChange: (criteria: ListCriteria) => void;
  /** The payees present in the month, for the Payee picker. */
  payeeOptions: readonly PayeeOption[];
  /** The Amount slider's scale (the month's expenses); null when there is no range to slide. */
  amountDomain: AmountDomain | null;
};

/**
 * The list's filters: a search field, then one scrolling row of chips (Type, Category, Payee,
 * Amount, Sort). A chip opens its picker right under the row (one at a time, pushing the list
 * down) and every choice applies at once; tapping the chip again closes it, as does picking a
 * single-select value. A Clear at the end of the row shows when any filter is on.
 */
export const TransactionFilterBar = memo(function TransactionFilterBar({
  criteria,
  onCriteriaChange,
  payeeOptions,
  amountDomain,
}: TransactionFilterBarProps) {
  const styles = useStyles();
  const reduceMotion = useReduceMotion();
  // `open` is the chip whose panel is wanted; `panelId` is the panel on screen, which outlives it
  // for the length of the collapse.
  const [open, setOpen] = useState<FilterId | null>(null);
  const [panelId, setPanelId] = useState<FilterId | null>(null);

  const spend = useCategories("spend").categories;
  const recurringExpense = useCategories("recurring_expense").categories;
  const recurringIncome = useCategories("recurring_income").categories;
  // The picker offers the user's own spending categories, plus any selected id outside them (a
  // recurring one a link seeded) so it can be unticked; every id gets its name on the chip.
  const categoryNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const category of [...recurringIncome, ...recurringExpense, ...spend]) {
      names.set(category.id, category.name);
    }
    return names;
  }, [recurringExpense, recurringIncome, spend]);
  const categoryOptions = useMemo(
    () => buildCategoryOptions(spend, criteria.categoryIds, (id) => categoryNames.get(id)),
    [categoryNames, criteria.categoryIds, spend],
  );

  const set = (patch: Partial<ListCriteria>) => onCriteriaChange({ ...criteria, ...patch });

  const categoryValue = useMemo(() => {
    if (criteria.categoryIds.length === 0) return null;
    const names = criteria.categoryIds.map(
      (id) => categoryOptions.find((option) => option.id === id)?.name ?? "Category",
    );
    return describeSelection(names);
  }, [categoryOptions, criteria.categoryIds]);
  const payeeValue = useMemo(() => {
    if (criteria.payeeKeys.length === 0) return null;
    const names = criteria.payeeKeys.map(
      (key) => payeeOptions.find((option) => option.key === key)?.name ?? key,
    );
    return describeSelection(names);
  }, [criteria.payeeKeys, payeeOptions]);
  const typeValue =
    criteria.type === "all"
      ? null
      : { label: LIST_TYPE_LABELS[criteria.type], spoken: LIST_TYPE_LABELS[criteria.type] };
  const amountLabel = amountFilterLabel(criteria);
  const amountValue = hasAmountFilter(criteria)
    ? { label: amountLabel, spoken: amountLabel }
    : null;
  const sortValue =
    criteria.sort === "newest"
      ? null
      : { label: LIST_SORT_LABELS[criteria.sort], spoken: LIST_SORT_LABELS[criteria.sort] };

  const anyActive = countActiveFilters(criteria) > 0;
  const close = () => setOpen(null);
  const toggle = (id: FilterId) => {
    if (open === id) {
      setOpen(null);
      return;
    }
    setOpen(id);
    setPanelId(id);
  };
  const onCollapsed = useCallback(() => setPanelId(null), []);

  let picker = null;
  switch (panelId) {
    case "type":
      picker = (
        <TypePicker
          value={criteria.type}
          onSelect={(type) => {
            set({ type });
            close();
          }}
        />
      );
      break;
    case "sort":
      picker = (
        <SortPicker
          value={criteria.sort}
          onSelect={(sort) => {
            set({ sort });
            close();
          }}
        />
      );
      break;
    case "category":
      picker = (
        <CategoryPicker
          options={categoryOptions}
          selectedIds={criteria.categoryIds}
          onToggle={(id) => onCriteriaChange(toggleListCategory(criteria, id))}
        />
      );
      break;
    case "payee":
      picker = (
        <PayeePicker
          options={payeeOptions}
          selectedKeys={criteria.payeeKeys}
          onToggle={(key) => onCriteriaChange(toggleListPayee(criteria, key))}
        />
      );
      break;
    case "amount":
      picker = (
        <AmountPicker
          domain={amountDomain}
          criteria={criteria}
          onChange={(amountMinPaise, amountMaxPaise) =>
            set({ amountMinPaise, amountMaxPaise })
          }
        />
      );
      break;
    default:
      break;
  }

  return (
    <View>
      <SearchField value={criteria.search} onChange={(search) => set({ search })} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        keyboardShouldPersistTaps="handled"
      >
        <FilterChip
          name="Type"
          value={typeValue}
          open={open === "type"}
          onToggle={() => toggle("type")}
          onClear={() => set({ type: DEFAULT_LIST_CRITERIA.type })}
        />
        <FilterChip
          name="Category"
          value={categoryValue}
          open={open === "category"}
          onToggle={() => toggle("category")}
          onClear={() => set({ categoryIds: [] })}
        />
        <FilterChip
          name="Payee"
          value={payeeValue}
          open={open === "payee"}
          onToggle={() => toggle("payee")}
          onClear={() => set({ payeeKeys: [] })}
        />
        <FilterChip
          name="Amount"
          value={amountValue}
          open={open === "amount"}
          onToggle={() => toggle("amount")}
          onClear={() => set({ amountMinPaise: null, amountMaxPaise: null })}
        />
        <FilterChip
          name="Sort"
          value={sortValue}
          open={open === "sort"}
          onToggle={() => toggle("sort")}
          onClear={() => set({ sort: DEFAULT_LIST_CRITERIA.sort })}
        />
        {anyActive ? (
          <Pressable
            onPress={() => {
              void triggerHaptic();
              onCriteriaChange(DEFAULT_LIST_CRITERIA);
            }}
            hitSlop={6}
            style={styles.clearAll}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Text style={styles.clearAllText}>Clear</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {panelId !== null ? (
        <FilterPanel
          open={open !== null}
          reduceMotion={reduceMotion}
          onCollapsed={onCollapsed}
        >
          <View key={panelId}>{picker}</View>
        </FilterPanel>
      ) : null}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 40,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  chipRow: {
    alignItems: "center",
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 220,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
  },
  chipActive: {
    backgroundColor: colors.accent,
  },
  chipOpen: {
    borderColor: colors.accentText,
  },
  chipMain: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.md,
  },
  chipMainActive: {
    paddingRight: spacing.xs,
  },
  chipText: {
    flexShrink: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  chipTextActive: {
    color: colors.onAccent,
  },
  chipClear: {
    minHeight: 32,
    paddingLeft: spacing.xs,
    paddingRight: spacing.sm,
    justifyContent: "center",
  },
  clearAll: {
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
  },
  clearAllText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentText,
  },
  panelFrame: {
    overflow: "hidden",
  },
  panelMeasure: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: spacing.sm,
  },
  panel: {
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
}));
