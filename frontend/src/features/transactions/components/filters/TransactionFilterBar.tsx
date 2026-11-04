import { ChevronDown, Search, X } from "lucide-react-native";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Button } from "@/components/ui";
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

import {
  AmountPicker,
  CategoryPicker,
  PayeePicker,
  SortPicker,
  TypePicker,
} from "./FilterPickers";

const SEARCH_DEBOUNCE_MS = 200;

type FilterId = "type" | "category" | "payee" | "amount" | "sort";

type FilterChipProps = {
  /** The dimension's name ("Category"): shown while the filter is off, and in the labels. */
  name: string;
  /** What the filter is set to; null while off. */
  value: { label: string; spoken: string } | null;
  /** Whether this chip's picker is the one showing. */
  open: boolean;
  onToggle: () => void;
  onClear: () => void;
};

/**
 * Inactive: name + chevron. Active: filled, shows its value, with an ✕ that clears just this
 * filter. Tapping it opens its picker in a modal.
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

const FILTER_TITLES: Record<FilterId, string> = {
  type: "Type",
  category: "Category",
  payee: "Payee",
  amount: "Amount",
  sort: "Sort",
};

type FilterModalProps = {
  visible: boolean;
  title: string;
  /** Multi-select pickers get a Done button; single-select ones close on the choice. */
  showDone: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * A picker over a light scrim, the same surface as the transaction detail: a centred card with a
 * title and a close button. Tapping the scrim or Back closes it; choices apply as they are made.
 */
function FilterModal({ visible, title, showDone, onClose, children }: FilterModalProps) {
  const { colors, shadows } = useTheme();
  const styles = useStyles();
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.modalRoot}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close filter"
        >
          <Pressable
            style={styles.cardShell}
            onPress={(event) => event.stopPropagation()}
            accessibilityViewIsModal
          >
            <View style={[styles.card, shadows.modal]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  style={({ pressed }) => [styles.closeButton, pressed && styles.closePressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={20} color={colors.inkSoft} strokeWidth={1.5} />
                </Pressable>
              </View>
              {children}
              {showDone ? (
                <View style={styles.cardFooter}>
                  <Button title="Done" onPress={onClose} />
                </View>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
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
 * Amount, Sort). A chip opens its picker in a modal over a scrim, so the page behind does not
 * move; every choice applies at once, and picking a single-select value closes it. A Clear at the
 * end of the row shows when any filter is on.
 */
export const TransactionFilterBar = memo(function TransactionFilterBar({
  criteria,
  onCriteriaChange,
  payeeOptions,
  amountDomain,
}: TransactionFilterBarProps) {
  const styles = useStyles();
  // `open` is the picker showing; `panelId` is the last one opened, which the modal keeps
  // rendering while it fades out.
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
  const openPicker = (id: FilterId) => {
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
          onToggle={() => openPicker("type")}
          onClear={() => set({ type: DEFAULT_LIST_CRITERIA.type })}
        />
        <FilterChip
          name="Category"
          value={categoryValue}
          open={open === "category"}
          onToggle={() => openPicker("category")}
          onClear={() => set({ categoryIds: [] })}
        />
        <FilterChip
          name="Payee"
          value={payeeValue}
          open={open === "payee"}
          onToggle={() => openPicker("payee")}
          onClear={() => set({ payeeKeys: [] })}
        />
        <FilterChip
          name="Amount"
          value={amountValue}
          open={open === "amount"}
          onToggle={() => openPicker("amount")}
          onClear={() => set({ amountMinPaise: null, amountMaxPaise: null })}
        />
        <FilterChip
          name="Sort"
          value={sortValue}
          open={open === "sort"}
          onToggle={() => openPicker("sort")}
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
        <FilterModal
          visible={open !== null}
          title={FILTER_TITLES[panelId]}
          showDone={panelId === "category" || panelId === "payee" || panelId === "amount"}
          onClose={close}
        >
          {picker}
        </FilterModal>
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
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlays.scrim,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  cardShell: {
    width: "100%",
    maxWidth: 360,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  closePressed: {
    opacity: 0.6,
  },
  cardFooter: {
    marginTop: spacing.xs,
  },
}));
