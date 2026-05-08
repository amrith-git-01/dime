import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronRight, X } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button/Button";
import { TextField } from "@/components/ui/TextField/TextField";
import { fontFamilies } from "@/constants/fonts";
import { formStyles } from "@/constants/formStyles";
import { colors, spacing } from "@/constants/theme";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import { useManualAddTransactionUiStore } from "@/stores/manualAddTransactionUiStore";
import { useLocalCategories } from "@/features/categories/hooks/useLocalCategories";

import { submitManualTransaction } from "../api/submitTransactionApi";
import { useManualAddTransactionForm } from "../hooks/useManualAddTransactionForm";

const SHEET_RADIUS = 24;
const HANDLE_WIDTH = 36;
const HANDLE_HEIGHT = 4;
const BORDER_SUBTLE = "#E0DFFA";

export function ManualAddTransactionModal() {
  const insets = useSafeAreaInsets();
  const visible = useManualAddTransactionUiStore((s) => s.visible);
  const close = useManualAddTransactionUiStore((s) => s.close);
  const { userId, authReady } = useSessionUserId();
  const submitMutation = useMutation({
    mutationFn: submitManualTransaction,
  });
  const form = useManualAddTransactionForm();
  const { data: categories, loading: categoriesLoading } = useLocalCategories();

  const [amountFocused, setAmountFocused] = useState(false);
  const [iosPickerVisible, setIosPickerVisible] = useState(false);

  const onClose = useCallback(() => {
    void triggerLightHaptic();
    close();
    form.reset();
    submitMutation.reset();
    setIosPickerVisible(false);
  }, [close, form, submitMutation]);

  const openAndroidDatePicker = useCallback(() => {
    void triggerLightHaptic();
    DateTimePickerAndroid.open({
      value: form.transactionAt,
      mode: "date",
      onChange: (_event, date) => {
        if (date) {
          form.setTransactionAt(date);
        }
      },
    });
  }, [form]);

  const onDateRowPress = useCallback(() => {
    if (Platform.OS === "android") {
      openAndroidDatePicker();
    } else {
      void triggerLightHaptic();
      setIosPickerVisible(true);
    }
  }, [openAndroidDatePicker]);

  const onSave = useCallback(async () => {
    if (!authReady || !userId) {
      Alert.alert("Sign in required", "Sign in to add a transaction.");
      return;
    }
    const payload = form.buildPayload();
    if (!payload) {
      Alert.alert(
        "Check fields",
        "Enter a positive amount and a merchant name.",
      );
      return;
    }
    try {
      await submitMutation.mutateAsync(payload);
      onClose();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save transaction.";
      Alert.alert("Something went wrong", message);
    }
  }, [authReady, form, onClose, submitMutation, userId]);

  const optionalTag = <Text style={styles.optionalHint}>(optional)</Text>;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
        />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md,
            },
          ]}
        >
          <View style={styles.handlePill} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>Add transaction</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={12}
              onPress={onClose}
              style={({ pressed }) => [pressed && styles.headerIconPressed]}
            >
              <X size={22} color={colors.inactive} strokeWidth={2} />
            </Pressable>
          </View>

          <KeyboardAwareScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="none"
            bottomOffset={24}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.fieldBlock}>
              <Text style={formStyles.fieldLabel}>Amount</Text>
              <View
                style={[
                  formStyles.fieldShell,
                  styles.amountShellMin,
                  amountFocused && formStyles.fieldShellFocused,
                ]}
              >
                <View style={styles.currencyPrefixWrap}>
                  <Text style={styles.currencyPrefix}>₹</Text>
                </View>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor={colors.inactive}
                  keyboardType="decimal-pad"
                  value={form.amountText}
                  onChangeText={form.setAmountText}
                  onFocus={() => setAmountFocused(true)}
                  onBlur={() => setAmountFocused(false)}
                  underlineColorAndroid="transparent"
                />
              </View>
            </View>

            <Text style={[formStyles.fieldLabel, styles.segmentLabel]}>
              Type
            </Text>
            <View style={styles.segmentRow}>
              <SegmentChip
                label="Expense"
                selected={form.txType === "debit"}
                onPress={() => {
                  void triggerLightHaptic();
                  form.setTxType("debit");
                }}
              />
              <SegmentChip
                label="Income"
                selected={form.txType === "credit"}
                onPress={() => {
                  void triggerLightHaptic();
                  form.setTxType("credit");
                }}
              />
            </View>

            <View style={styles.fieldBlock}>
              <TextField
                label="Merchant"
                placeholder="Where was this?"
                value={form.merchant}
                onChangeText={form.setMerchant}
              />
            </View>

            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={formStyles.fieldLabel}>Category</Text>
                {optionalTag}
              </View>
              {categoriesLoading ? (
                <View style={styles.categoriesLoading}>
                  <ActivityIndicator color={colors.headerGradientStart} />
                </View>
              ) : (
                <View style={styles.categoryGrid}>
                  {categories.map((category) => {
                    const selected = form.categoryId === category.id;
                    return (
                      <CategoryPill
                        key={category.id}
                        label={category.name}
                        emoji={category.emoji}
                        selected={selected}
                        onPress={() => {
                          void triggerLightHaptic();
                          if (selected) {
                            form.setCategoryId(null);
                            form.setCategory("");
                            return;
                          }
                          form.setCategoryId(category.id);
                          form.setCategory(category.name);
                        }}
                      />
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.fieldBlock}>
              <TextField
                label="Note"
                labelRight={optionalTag}
                placeholder="Add a short note"
                value={form.note}
                onChangeText={form.setNote}
              />
            </View>

            <Text style={[formStyles.fieldLabel, styles.dateLabel]}>Date</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onDateRowPress}
              style={({ pressed }) => [
                styles.dateRow,
                pressed && styles.dateRowPressed,
              ]}
            >
              <Text style={styles.dateValue}>
                {format(form.transactionAt, "MMM d, yyyy")}
              </Text>
              <ChevronRight size={20} color={colors.inactive} strokeWidth={2} />
            </Pressable>

            {iosPickerVisible ? (
              <View style={styles.iosPickerWrap}>
                <DateTimePicker
                  value={form.transactionAt}
                  mode="date"
                  display="compact"
                  themeVariant="light"
                  onChange={(_e, date) => {
                    setIosPickerVisible(false);
                    if (date) {
                      form.setTransactionAt(date);
                    }
                  }}
                />
              </View>
            ) : null}
          </KeyboardAwareScrollView>

          <View style={styles.footerActions}>
            <Button
              title="Save"
              loading={submitMutation.isPending}
              onPress={() => {
                void onSave();
              }}
            />
            <Button variant="secondary" title="Cancel" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

type SegmentChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

function SegmentChip({ label, selected, onPress }: SegmentChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segmentChip,
        selected && styles.segmentChipSelected,
        pressed && styles.segmentChipPressed,
      ]}
    >
      <Text
        style={[styles.segmentChipText, selected && styles.segmentChipTextOn]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type CategoryPillProps = {
  label: string;
  emoji: string;
  selected: boolean;
  onPress: () => void;
};

function CategoryPill({ label, emoji, selected, onPress }: CategoryPillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryPill,
        selected && styles.categoryPillSelected,
        pressed && styles.categoryPillPressed,
      ]}
    >
      <Text style={styles.categoryPillEmoji}>{emoji}</Text>
      <Text
        style={[styles.categoryPillLabel, selected && styles.categoryPillLabelOn]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(21, 28, 39, 0.45)",
  },
  sheet: {
    backgroundColor: colors.barBackground,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: "92%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
  handlePill: {
    alignSelf: "center",
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    borderRadius: HANDLE_HEIGHT / 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  headerIconPressed: {
    opacity: 0.7,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 20,
    lineHeight: 28,
    color: colors.textPrimary,
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  fieldBlock: {
    marginBottom: spacing.xl,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  segmentLabel: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  optionalHint: {
    fontFamily: fontFamilies.regular,
    color: colors.inactive,
    fontSize: 12,
  },
  categoriesLoading: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.pageBackground,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  categoryPill: {
    maxWidth: "100%",
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.pageBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  categoryPillSelected: {
    borderColor: colors.headerGradientStart,
    backgroundColor: "rgba(79, 70, 229, 0.10)",
  },
  categoryPillPressed: {
    opacity: 0.92,
  },
  categoryPillEmoji: {
    fontSize: 16,
    lineHeight: 18,
  },
  categoryPillLabel: {
    flexShrink: 0,
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  categoryPillLabelOn: {
    color: colors.textPrimary,
  },
  amountShellMin: {
    minHeight: 52,
  },
  /** Same line box height as amount TextInput on Android so ₹ matches placeholder/text. */
  currencyPrefixWrap: {
    marginRight: spacing.xs,
    justifyContent: "center",
    ...Platform.select({
      android: { height: 26 },
    }),
  },
  currencyPrefix: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 24,
    color: colors.textPrimary,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        lineHeight: 26,
      },
      default: {
        lineHeight: 30,
      },
    }),
  },
  amountInput: {
    flex: 1,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 24,
    color: colors.textPrimary,
    padding: 0,
    margin: 0,
    ...Platform.select({
      android: {
        height: "100%",
        paddingVertical: 0,
        includeFontPadding: false,
        textAlignVertical: "center",
        lineHeight: 26,
      },
      ios: {
        lineHeight: 30,
        paddingVertical: 2,
      },
    }),
  },
  segmentRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  segmentChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.pageBackground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  segmentChipSelected: {
    backgroundColor: "rgba(15, 23, 42, 0.06)",
    borderColor: "#64748B",
  },
  segmentChipPressed: {
    opacity: 0.92,
  },
  segmentChipText: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  segmentChipTextOn: {
    color: colors.textPrimary,
  },
  dateLabel: {
    marginBottom: spacing.sm,
  },
  dateRow: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    backgroundColor: colors.barBackground,
  },
  dateRowPressed: {
    backgroundColor: colors.pageBackground,
  },
  dateValue: {
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  footerActions: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  iosPickerWrap: {
    marginBottom: spacing.md,
    alignItems: "flex-start",
  },
});
