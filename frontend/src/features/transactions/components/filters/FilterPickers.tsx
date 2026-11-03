import { Check } from "lucide-react-native";
import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";

import { TextField } from "@/components/ui";
import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/spacing";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

import {
  amountBoundsFromValues,
  amountValuesFromBounds,
  type AmountDomain,
} from "../../utils/amountRange";
import {
  hasAmountFilter,
  LIST_SORT_LABELS,
  LIST_TYPE_FILTERS,
  LIST_TYPE_LABELS,
  type ListCriteria,
  type ListSort,
  type ListTypeFilter,
  type PayeeOption,
} from "../../utils/monthListFilter";

import { AmountRangeSlider } from "./AmountRangeSlider";

/** A payee list this long gets a search box of its own. */
const PAYEE_SEARCH_THRESHOLD = 8;
/** A long option list scrolls inside its panel past this height. */
const PICKER_MAX_HEIGHT = 264;

type OptionRowProps = {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

const OptionRow = memo(function OptionRow({
  label,
  detail,
  selected,
  onPress,
  accessibilityLabel,
}: OptionRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic();
        onPress();
      }}
      style={styles.row}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]} numberOfLines={1}>
        {label}
      </Text>
      {detail ? (
        <Text style={styles.rowDetail} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
      <View style={styles.rowCheck}>
        {selected ? <Check size={18} color={colors.accentText} strokeWidth={2.5} /> : null}
      </View>
    </Pressable>
  );
});

type SingleChoiceProps<T extends string> = {
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onSelect: (value: T) => void;
};

function SingleChoice<T extends string>({
  options,
  labels,
  value,
  onSelect,
}: SingleChoiceProps<T>) {
  return (
    <View>
      {options.map((option) => (
        <OptionRow
          key={option}
          label={labels[option]}
          selected={option === value}
          onPress={() => onSelect(option)}
        />
      ))}
    </View>
  );
}

const SORT_OPTIONS: readonly ListSort[] = ["newest", "oldest", "amount"];

/** The Type choices: every type but "all", which is the state of having none picked. */
const TYPE_OPTIONS = LIST_TYPE_FILTERS.filter((type) => type !== "all");

/** Type: Expense, Income, Recurring or Flexible; picking the active one again clears it. */
export function TypePicker({
  value,
  onSelect,
}: {
  value: ListTypeFilter;
  onSelect: (value: ListTypeFilter) => void;
}) {
  return (
    <SingleChoice
      options={TYPE_OPTIONS}
      labels={LIST_TYPE_LABELS}
      value={value}
      onSelect={(next) => onSelect(next === value ? "all" : next)}
    />
  );
}

/** Sort: Newest, Oldest or Highest amount. */
export function SortPicker({
  value,
  onSelect,
}: {
  value: ListSort;
  onSelect: (value: ListSort) => void;
}) {
  return (
    <SingleChoice
      options={SORT_OPTIONS}
      labels={LIST_SORT_LABELS}
      value={value}
      onSelect={onSelect}
    />
  );
}

/** Category: any number, including Uncategorized. */
export function CategoryPicker({
  options,
  selectedIds,
  onToggle,
}: {
  options: readonly { id: string; name: string }[];
  selectedIds: readonly string[];
  onToggle: (id: string) => void;
}) {
  const styles = useStyles();
  return (
    <ScrollView
      style={styles.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((option) => (
        <OptionRow
          key={option.id}
          label={option.name}
          selected={selectedIds.includes(option.id)}
          onPress={() => onToggle(option.id)}
        />
      ))}
    </ScrollView>
  );
}

/** Payee: any number of the payees in the month, with a search box when there are many. */
export function PayeePicker({
  options,
  selectedKeys,
  onToggle,
}: {
  options: readonly PayeeOption[];
  selectedKeys: readonly string[];
  onToggle: (key: string) => void;
}) {
  const styles = useStyles();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      needle.length === 0
        ? options
        : options.filter((option) => option.name.toLowerCase().includes(needle)),
    [needle, options],
  );
  return (
    <View style={styles.payeeBody}>
      {options.length > PAYEE_SEARCH_THRESHOLD ? (
        <View style={styles.pickerSearch}>
          <TextField
            label="Search payees"
            hideLabel
            value={query}
            onChangeText={setQuery}
            placeholder="Search payees"
            autoCapitalize="none"
            autoCorrect={false}
            showClear
          />
        </View>
      ) : null}
      {shown.length === 0 ? (
        <Text style={styles.emptyText}>
          {options.length === 0 ? "No payees in this month." : "No payee matches."}
        </Text>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(option) => option.key}
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <OptionRow
              label={item.name}
              detail={`${item.count} · ${formatInrCompact(item.totalPaise / 100)}`}
              selected={selectedKeys.includes(item.key)}
              onPress={() => onToggle(item.key)}
              accessibilityLabel={`${item.name}, ${item.count} ${item.count === 1 ? "transaction" : "transactions"}`}
            />
          )}
        />
      )}
    </View>
  );
}

/**
 * Amount: a two-thumb range over the month's expenses. A thumb at the end of the scale leaves that
 * side unbounded, so the full range is no filter. Without a usable range (no expenses, or all the
 * same amount) it only says so, and still offers Reset for a filter carried over from elsewhere.
 */
export function AmountPicker({
  domain,
  criteria,
  onChange,
}: {
  domain: AmountDomain | null;
  criteria: ListCriteria;
  onChange: (minPaise: number | null, maxPaise: number | null) => void;
}) {
  const styles = useStyles();
  const active = hasAmountFilter(criteria);
  const values = useMemo(
    () =>
      domain
        ? amountValuesFromBounds(domain, {
            amountMinPaise: criteria.amountMinPaise,
            amountMaxPaise: criteria.amountMaxPaise,
          })
        : null,
    [criteria.amountMaxPaise, criteria.amountMinPaise, domain],
  );
  const handleChange = useCallback(
    (low: number, high: number) => {
      if (!domain) return;
      const bounds = amountBoundsFromValues(domain, low, high);
      onChange(bounds.amountMinPaise, bounds.amountMaxPaise);
    },
    [domain, onChange],
  );
  const reset = () => {
    void triggerHaptic();
    onChange(null, null);
  };

  return (
    <View style={styles.amountBody}>
      {domain && values ? (
        <AmountRangeSlider
          domain={domain}
          lowPaise={values.low}
          highPaise={values.high}
          onChange={handleChange}
        />
      ) : (
        <Text style={styles.emptyText}>
          Nothing to slide yet: this month needs expenses of different amounts.
        </Text>
      )}
      {active ? (
        <Pressable
          onPress={reset}
          hitSlop={8}
          style={styles.resetButton}
          accessibilityRole="button"
          accessibilityLabel="Reset amount range"
        >
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: PICKER_MAX_HEIGHT,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    gap: spacing.sm,
  },
  rowLabel: {
    flexShrink: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  rowLabelSelected: {
    fontFamily: fontFamilies.semiBold,
  },
  rowDetail: {
    flex: 1,
    textAlign: "right",
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  rowCheck: {
    width: 22,
    alignItems: "flex-end",
    marginLeft: "auto",
  },
  payeeBody: {
    flexShrink: 1,
  },
  pickerSearch: {
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
    paddingVertical: spacing.lg,
  },
  amountBody: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  resetButton: {
    alignSelf: "flex-end",
    minHeight: 44,
    justifyContent: "center",
  },
  resetText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.accentText,
  },
}));
