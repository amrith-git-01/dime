import { ChevronDown, Search, X } from "lucide-react-native";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { useCategories } from "@/features/categories/hooks/useCategories";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

import { UNCATEGORIZED_CATEGORY_KEY } from "../../constants/uncategorizedCategoryKey";
import {
  amountFilterLabel,
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

import { FilterPickerSheet } from "./FilterPickerSheet";
import {
  AmountPicker,
  CategoryPicker,
  PayeePicker,
  SortPicker,
  TypePicker,
} from "./FilterPickers";

const SEARCH_DEBOUNCE_MS = 200;

type FilterId = "type" | "category" | "payee" | "amount" | "sort";

const FILTER_TITLES: Record<FilterId, string> = {
  type: "Type",
  category: "Category",
  payee: "Payee",
  amount: "Amount",
  sort: "Sort",
};

type FilterChipProps = {
  /** The dimension's name ("Category"): shown while the filter is off, and in the labels. */
  name: string;
  /** What the filter is set to; null while off. */
  value: { label: string; spoken: string } | null;
  onOpen: () => void;
  onClear: () => void;
};

/** Inactive: name + chevron. Active: filled, shows its value, with an ✕ that clears just this filter. */
const FilterChip = memo(function FilterChip({
  name,
  value,
  onOpen,
  onClear,
}: FilterChipProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const active = value !== null;
  return (
    <View style={[styles.chip, active && styles.chipActive]}>
      <Pressable
        onPress={() => {
          void triggerHaptic();
          onOpen();
        }}
        style={[styles.chipMain, active && styles.chipMainActive]}
        accessibilityRole="button"
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
          <ChevronDown size={14} color={colors.inkSoft} strokeWidth={2.25} />
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

export type TransactionFilterBarProps = {
  criteria: ListCriteria;
  onCriteriaChange: (criteria: ListCriteria) => void;
  /** The payees present in the month, for the Payee picker. */
  payeeOptions: readonly PayeeOption[];
};

/**
 * The list's filters: a search field, then one scrolling row of chips (Type, Category, Payee,
 * Amount, Sort) that each open a small picker applying at once, and a Clear at the end when any
 * filter is on.
 */
export const TransactionFilterBar = memo(function TransactionFilterBar({
  criteria,
  onCriteriaChange,
  payeeOptions,
}: TransactionFilterBarProps) {
  const styles = useStyles();
  const [open, setOpen] = useState<FilterId | null>(null);

  const spend = useCategories("spend").categories;
  const recurringExpense = useCategories("recurring_expense").categories;
  const recurringIncome = useCategories("recurring_income").categories;
  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: { id: string; name: string }[] = [
      { id: UNCATEGORIZED_CATEGORY_KEY, name: "Uncategorized" },
    ];
    for (const category of [...spend, ...recurringExpense, ...recurringIncome]) {
      if (!seen.has(category.id)) {
        seen.add(category.id);
        options.push({ id: category.id, name: category.name });
      }
    }
    return options;
  }, [recurringExpense, recurringIncome, spend]);

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

  let picker = null;
  switch (open) {
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
    <View style={styles.root}>
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
          onOpen={() => setOpen("type")}
          onClear={() => set({ type: DEFAULT_LIST_CRITERIA.type })}
        />
        <FilterChip
          name="Category"
          value={categoryValue}
          onOpen={() => setOpen("category")}
          onClear={() => set({ categoryIds: [] })}
        />
        <FilterChip
          name="Payee"
          value={payeeValue}
          onOpen={() => setOpen("payee")}
          onClear={() => set({ payeeKeys: [] })}
        />
        <FilterChip
          name="Amount"
          value={amountValue}
          onOpen={() => setOpen("amount")}
          onClear={() => set({ amountMinPaise: null, amountMaxPaise: null })}
        />
        <FilterChip
          name="Sort"
          value={sortValue}
          onOpen={() => setOpen("sort")}
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
      {open !== null ? (
        <FilterPickerSheet title={FILTER_TITLES[open]} onClose={close}>
          {picker}
        </FilterPickerSheet>
      ) : null}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    gap: spacing.sm,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 40,
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
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
  },
  chipActive: {
    backgroundColor: colors.accent,
  },
  chipMain: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 34,
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
    minHeight: 34,
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
}));
