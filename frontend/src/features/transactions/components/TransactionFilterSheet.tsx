import { memo, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TextField } from "@/components/ui";
import { radius } from "@/constants/radius";
import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/spacing";
import { useCategories } from "@/features/categories/hooks/useCategories";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles } from "@/theme";

import { UNCATEGORIZED_CATEGORY_KEY } from "../constants/uncategorizedCategoryKey";
import {
  DEFAULT_LIST_CRITERIA,
  setListKind,
  setListType,
  toggleListCategory,
  type ListCriteria,
  type ListKindFilter,
  type ListSort,
  type ListTypeFilter,
} from "../utils/monthListFilter";

const TYPE_OPTIONS: readonly { value: ListTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "debit", label: "Spent" },
  { value: "credit", label: "Received" },
];

const KIND_OPTIONS: readonly { value: ListKindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "recurring", label: "Recurring" },
  { value: "flexible", label: "Flexible" },
];

const SORT_OPTIONS: readonly { value: ListSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "amount", label: "Highest amount" },
];

export type TransactionFilterSheetProps = {
  /** The filters the list has now: where the sheet starts. */
  initial: ListCriteria;
  /** Cancel, backdrop tap or Android back: nothing changes. */
  onCancel: () => void;
  /** Apply: the filters to use. */
  onApply: (criteria: ListCriteria) => void;
};

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

const Chip = memo(function Chip({ label, selected, onPress }: ChipProps) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
});

type OptionRowProps<T extends string> = {
  title: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

function OptionRow<T extends string>({
  title,
  options,
  value,
  onChange,
}: OptionRowProps<T>) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.chipWrap}>
        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={option.value === value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Bottom sheet with the transactions list's filters: search, type, kind, categories and sort.
 * Edits stay in the sheet until Apply; Reset only resets the draft. Mount a fresh one (a new
 * `key`, or render it only while open) for each opening.
 */
export const TransactionFilterSheet = memo(function TransactionFilterSheet({
  initial,
  onCancel,
  onApply,
}: TransactionFilterSheetProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ListCriteria>(initial);

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

  const isDefault =
    draft.type === DEFAULT_LIST_CRITERIA.type &&
    draft.kind === DEFAULT_LIST_CRITERIA.kind &&
    draft.categoryIds.length === 0 &&
    draft.search.length === 0 &&
    draft.sort === DEFAULT_LIST_CRITERIA.sort;

  const apply = () => {
    void triggerHaptic();
    onApply({ ...draft, search: draft.search.trim() });
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Close filters without applying"
        />
        <View
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
          accessibilityViewIsModal
        >
          <View style={styles.grabberArea}>
            <View style={styles.grabber} />
          </View>

          <View style={styles.header}>
            <Pressable
              style={styles.headerButton}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
              Filters
            </Text>
            <Pressable
              style={[styles.headerButton, styles.headerButtonEnd]}
              onPress={apply}
              accessibilityRole="button"
              accessibilityLabel="Apply filters"
            >
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Search</Text>
              <TextField
                label="Search"
                hideLabel
                value={draft.search}
                onChangeText={(search) => setDraft((d) => ({ ...d, search }))}
                placeholder="Payee, note or category"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                showClear
              />
            </View>

            <OptionRow
              title="Type"
              options={TYPE_OPTIONS}
              value={draft.type}
              onChange={(type) => setDraft((d) => setListType(d, type))}
            />
            <OptionRow
              title="Kind"
              options={KIND_OPTIONS}
              value={draft.kind}
              onChange={(kind) => setDraft((d) => setListKind(d, kind))}
            />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Category</Text>
              <View style={styles.chipWrap}>
                {categoryOptions.map((option) => (
                  <Chip
                    key={option.id}
                    label={option.name}
                    selected={draft.categoryIds.includes(option.id)}
                    onPress={() =>
                      setDraft((d) => toggleListCategory(d, option.id))
                    }
                  />
                ))}
              </View>
            </View>

            <OptionRow
              title="Sort"
              options={SORT_OPTIONS}
              value={draft.sort}
              onChange={(sort) => setDraft((d) => ({ ...d, sort }))}
            />
          </ScrollView>

          <Pressable
            style={styles.reset}
            onPress={() => setDraft({ ...DEFAULT_LIST_CRITERIA })}
            disabled={isDefault}
            accessibilityRole="button"
            accessibilityLabel="Reset filters"
            accessibilityState={{ disabled: isDefault }}
          >
            <Text style={[styles.resetText, isDefault && styles.resetTextDisabled]}>
              Reset
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlays.scrimLight,
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
  },
  grabberArea: {
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.line,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    marginBottom: spacing.sm,
  },
  headerButton: {
    minWidth: 72,
    minHeight: 48,
    justifyContent: "center",
  },
  headerButtonEnd: {
    alignItems: "flex-end",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontFamily: fontFamilies.semiBold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
  },
  cancelText: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  applyText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.accentText,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
  },
  chipSelected: {
    backgroundColor: colors.accent,
  },
  chipText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  chipTextSelected: {
    color: colors.onAccent,
  },
  reset: {
    alignSelf: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  resetText: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.accentText,
  },
  resetTextDisabled: {
    color: colors.inkFaint,
  },
}));
