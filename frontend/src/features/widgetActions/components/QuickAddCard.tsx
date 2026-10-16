import { randomUUID } from "expo-crypto";
import { CheckCircle2 } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { Button, TextField } from "@/components/ui";
import { fontFamilies, spacing } from "@/constants";
import { useCategories } from "@/features/categories/hooks/useCategories";
import {
  ManualAddAmountSection,
  ManualAddCategorySection,
} from "@/features/transactions/components";
import { visibleSpendCategories } from "@/features/transactions/utils/manualAddCategoryUtils";
import { parseAmountInputToPaise } from "@/utils/paise";
import { createThemedStyles, useTheme } from "@/theme";

import { closeCard } from "../hooks/useCardClose";
import { addExpense } from "../utils/addExpense";
import { CardFrame } from "./CardFrame";

/** The confirmation stays this long before the card goes. */
const ADDED_LINGER_MS = 1_200;
/** The category chips scroll inside this height instead of growing the card past the keyboard. */
const CATEGORY_LIST_MAX_HEIGHT = 128;
const NOOP = () => undefined;

/**
 * Add: a small card over the home screen. Amount, an optional payee and an everyday category,
 * then Save posts the expense dated now. Needs only the amount and a category.
 */
export function QuickAddCard({ userId }: { userId: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { categories, isLoading } = useCategories("spend");
  const expenseCategories = useMemo(
    () => visibleSpendCategories(categories, "debit"),
    [categories],
  );

  const [amountText, setAmountText] = useState("");
  const [payee, setPayee] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedText, setAddedText] = useState<string | null>(null);
  // One key per card, so Save pressed again after a dropped connection cannot add it twice.
  const idempotencyKeyRef = useRef(randomUUID());

  const amountPaise = parseAmountInputToPaise(amountText);
  const category = expenseCategories.find((row) => row.id === categoryId) ?? null;
  const canSave = amountPaise !== null && category !== null && !saving;

  useEffect(() => {
    if (addedText === null) {
      return;
    }
    const timer = setTimeout(closeCard, ADDED_LINGER_MS);
    return () => clearTimeout(timer);
  }, [addedText]);

  const onSave = async () => {
    if (amountPaise === null || category === null || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      setAddedText(
        await addExpense({
          userId,
          amountPaise,
          payee,
          category: { id: category.id, name: category.name },
          idempotencyKey: idempotencyKeyRef.current,
        }),
      );
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  };

  if (addedText !== null) {
    return (
      <CardFrame variant="sheet" onBackdropPress={closeCard}>
        <View style={styles.added} accessibilityLiveRegion="polite">
          <CheckCircle2 size={24} color={colors.success} />
          <Text style={styles.addedText}>{addedText}</Text>
        </View>
      </CardFrame>
    );
  }

  return (
    <CardFrame variant="sheet" onBackdropPress={saving ? undefined : closeCard}>
      <ManualAddAmountSection
        amountText={amountText}
        amountFocused
        onAmountChange={setAmountText}
        onAmountFocus={NOOP}
        onAmountBlur={NOOP}
        txType="debit"
        onSetExpense={NOOP}
        onSetIncome={NOOP}
        showTypeToggle={false}
        autoFocus
      />
      <View style={styles.body}>
        <TextField
          label="Paid to"
          hideLabel
          placeholder="Paid to (optional)"
          value={payee}
          onChangeText={setPayee}
          maxLength={200}
          autoCapitalize="sentences"
          returnKeyType="done"
          editable={!saving}
        />
        <ScrollView
          style={styles.categories}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ManualAddCategorySection
            categoriesLoading={isLoading}
            visibleCategories={expenseCategories}
            categoryId={categoryId}
            onCategoryPress={(row) => setCategoryId(row.id)}
          />
        </ScrollView>
        {error ? (
          <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Button title="Save" loading={saving} disabled={!canSave} onPress={() => void onSave()} />
      </View>
    </CardFrame>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  body: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  categories: {
    maxHeight: CATEGORY_LIST_MAX_HEIGHT,
    flexGrow: 0,
  },
  error: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
  added: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  addedText: {
    flexShrink: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 17,
    lineHeight: 22,
    color: colors.success,
  },
}));
