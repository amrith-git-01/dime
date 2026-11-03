import { Check } from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";

import { TextField } from "@/components/ui";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";
import { formatInrCompact } from "@/utils/currency";
import { parseAmountInputToPaise } from "@/utils/paise";

import {
  activeAmountPreset,
  AMOUNT_PRESETS,
  LIST_SORT_LABELS,
  LIST_TYPE_FILTERS,
  LIST_TYPE_LABELS,
  type ListCriteria,
  type ListSort,
  type ListTypeFilter,
  type PayeeOption,
} from "../../utils/monthListFilter";

/** A payee list this long gets a search box of its own. */
const PAYEE_SEARCH_THRESHOLD = 8;

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

/** Type: one of All / Spent / Recurring / Flexible / Received. */
export function TypePicker({
  value,
  onSelect,
}: {
  value: ListTypeFilter;
  onSelect: (value: ListTypeFilter) => void;
}) {
  return (
    <SingleChoice
      options={LIST_TYPE_FILTERS}
      labels={LIST_TYPE_LABELS}
      value={value}
      onSelect={onSelect}
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

function paiseToInputText(paise: number | null): string {
  if (paise === null) return "";
  const rupees = paise / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

/** Amount: quick ranges, or a minimum and/or maximum in rupees (both inclusive). */
export function AmountPicker({
  criteria,
  onChange,
}: {
  criteria: ListCriteria;
  onChange: (minPaise: number | null, maxPaise: number | null) => void;
}) {
  const styles = useStyles();
  const [minText, setMinText] = useState(paiseToInputText(criteria.amountMinPaise));
  const [maxText, setMaxText] = useState(paiseToInputText(criteria.amountMaxPaise));
  const preset = activeAmountPreset(criteria);

  const parse = (text: string) => (text.trim().length === 0 ? null : parseAmountInputToPaise(text));
  const changeMin = (text: string) => {
    setMinText(text);
    onChange(parse(text), criteria.amountMaxPaise);
  };
  const changeMax = (text: string) => {
    setMaxText(text);
    onChange(criteria.amountMinPaise, parse(text));
  };
  const pickPreset = (id: string) => {
    void triggerHaptic();
    const next = AMOUNT_PRESETS.find((p) => p.id === id);
    if (!next || preset?.id === id) {
      setMinText("");
      setMaxText("");
      onChange(null, null);
      return;
    }
    setMinText(paiseToInputText(next.minPaise));
    setMaxText(paiseToInputText(next.maxPaise));
    onChange(next.minPaise, next.maxPaise);
  };

  return (
    <ScrollView
      style={styles.scroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.amountInputs}>
        <View style={styles.amountField}>
          <TextField
            label="Minimum amount"
            hideLabel
            value={minText}
            onChangeText={changeMin}
            placeholder="Min ₹"
            keyboardType="decimal-pad"
            showClear
          />
        </View>
        <Text style={styles.amountDash}>to</Text>
        <View style={styles.amountField}>
          <TextField
            label="Maximum amount"
            hideLabel
            value={maxText}
            onChangeText={changeMax}
            placeholder="Max ₹"
            keyboardType="decimal-pad"
            showClear
          />
        </View>
      </View>
      <View style={styles.presetWrap}>
        {AMOUNT_PRESETS.map((option) => {
          const selected = preset?.id === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => pickPreset(option.id)}
              style={[styles.preset, selected && styles.presetSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
            >
              <Text style={[styles.presetText, selected && styles.presetTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
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
  amountInputs: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  amountField: {
    flex: 1,
  },
  amountDash: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  presetWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  preset: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
  },
  presetSelected: {
    backgroundColor: colors.accent,
  },
  presetText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  presetTextSelected: {
    color: colors.onAccent,
  },
}));
