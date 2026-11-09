import { ChevronDown, Search, X } from "lucide-react-native";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { useCategories } from "@/features/categories/hooks/useCategories";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
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

import { dropdownFrame, type Anchor } from "./dropdownFrame";
import {
  AmountPicker,
  CategoryPicker,
  PayeePicker,
  SortPicker,
  TypePicker,
} from "./FilterPickers";

const SEARCH_DEBOUNCE_MS = 200;
const NO_ANCHOR: Anchor = { x: 0, y: 0, width: 0, height: 0 };

type FilterId = "type" | "category" | "payee" | "amount" | "sort";

type FilterChipProps = {
  /** The dimension's name ("Category"): shown while the filter is off, and in the labels. */
  name: string;
  /** What the filter is set to; null while off. */
  value: { label: string; spoken: string } | null;
  /** Whether this chip's picker is the one showing. */
  open: boolean;
  onToggle: (anchor: Anchor) => void;
  onClear: () => void;
};

/**
 * Inactive: name + chevron. Active: filled, shows its value, with an ✕ that clears just this
 * filter. Tapping it opens its picker in a dropdown under the chip.
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
  const chipRef = useRef<View>(null);
  const openFromHere = () => {
    const node = chipRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x, y, width, height) => onToggle({ x, y, width, height }));
    } else {
      onToggle(NO_ANCHOR);
    }
  };
  return (
    <View
      ref={chipRef}
      collapsable={false}
      style={[styles.chip, active && styles.chipActive, open && styles.chipOpen]}
    >
      <Pressable
        onPress={() => {
          void triggerHaptic();
          openFromHere();
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

type FilterDropdownProps = {
  visible: boolean;
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
};

/**
 * A picker hanging under its chip, with no scrim: the page stays as it is. Tapping anywhere
 * outside (or Back) closes it; choices apply as they are made.
 * The Modal is deliberately not status-bar translucent: its window then starts where the app's
 * does, so the chip's measured position is the dropdown's coordinate too.
 */
function FilterDropdown({ visible, anchor, onClose, children }: FilterDropdownProps) {
  const { shadows } = useTheme();
  const styles = useStyles();
  const screen = useWindowDimensions();
  const frame = dropdownFrame(anchor, screen);
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.modalRoot}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close filter"
        />
        <View
          style={[styles.dropdown, shadows.modal, frame]}
          accessibilityViewIsModal
        >
          {children}
        </View>
      </GestureHandlerRootView>
    </Modal>
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
 * Amount, Sort). A chip opens its picker as a dropdown right under it, with no scrim, so the page
 * does not move; every choice applies at once, and picking a single-select value closes it. A
 * Clear at the end of the row shows when any filter is on.
 */
export const TransactionFilterBar = memo(function TransactionFilterBar({
  criteria,
  onCriteriaChange,
  payeeOptions,
  amountDomain,
}: TransactionFilterBarProps) {
  const styles = useStyles();
  // `open` is the picker showing; `panelId` is the last one opened, which the dropdown keeps
  // rendering while it fades out.
  const [open, setOpen] = useState<FilterId | null>(null);
  const [panelId, setPanelId] = useState<FilterId | null>(null);
  const [anchor, setAnchor] = useState<Anchor>(NO_ANCHOR);

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
  const openPicker = (id: FilterId, chip: Anchor) => {
    setAnchor(chip);
    setOpen(id);
    setPanelId(id);
  };

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
          onToggle={(chip) => openPicker("type", chip)}
          onClear={() => set({ type: DEFAULT_LIST_CRITERIA.type })}
        />
        <FilterChip
          name="Category"
          value={categoryValue}
          open={open === "category"}
          onToggle={(chip) => openPicker("category", chip)}
          onClear={() => set({ categoryIds: [] })}
        />
        <FilterChip
          name="Payee"
          value={payeeValue}
          open={open === "payee"}
          onToggle={(chip) => openPicker("payee", chip)}
          onClear={() => set({ payeeKeys: [] })}
        />
        <FilterChip
          name="Amount"
          value={amountValue}
          open={open === "amount"}
          onToggle={(chip) => openPicker("amount", chip)}
          onClear={() => set({ amountMinPaise: null, amountMaxPaise: null })}
        />
        <FilterChip
          name="Sort"
          value={sortValue}
          open={open === "sort"}
          onToggle={(chip) => openPicker("sort", chip)}
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
        <FilterDropdown visible={open !== null} anchor={anchor} onClose={close}>
          {picker}
        </FilterDropdown>
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
  modalRoot: {
    flex: 1,
  },
  dropdown: {
    position: "absolute",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
}));
