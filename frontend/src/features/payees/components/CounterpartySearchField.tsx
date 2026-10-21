import { Plus, Store, User } from "lucide-react-native";
import type { ReactNode } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { AppTextInput, TextField } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants";
import type { TransactionType } from "@/features/transactions/types";
import { createThemedStyles, useTheme } from "@/theme";

import { useBrandSearch } from "../hooks/useBrandSearch";
import { usePayeeSuggestions } from "../hooks/usePayeeSuggestions";
import type {
  BrandSuggestion,
  CounterpartySelection,
  PayeeCategory,
  PayeeSuggestion,
} from "../types";
import { mergeCounterpartyResults } from "../utils/mergeCounterpartyResults";

export type CounterpartySearchFieldProps = {
  txType: TransactionType;
  value: string;
  /** Typing (the form clears a picked brand here). */
  onChangeText: (text: string) => void;
  /** A payee or brand was picked. */
  onSelect: (selection: CounterpartySelection) => void;
  /** The catalogue brand currently picked, if any: its name is not searched again on focus. */
  brandId?: string | null;
  placeholder: string;
  /** The home-screen widget card: a lighter input, 4 chips / results and no section captions. */
  compact?: boolean;
  editable?: boolean;
};

const ATTRIBUTION = "Brand data © OpenStreetMap contributors, Wikidata";
const BLUR_CLOSE_MS = 150;
const DROPDOWN_MAX_HEIGHT = 300;
const CHIP_LIMIT = 8;
const COMPACT_CHIP_LIMIT = 4;
const COMPACT_CAPS = { maxYours: 4, maxBrands: 4, maxTotal: 4 };

type RowProps = {
  label: string;
  title: string;
  subtitle?: string | null;
  icon: ReactNode;
  onPress: () => void;
};

const ResultRow = memo(function ResultRow({
  label,
  title,
  subtitle,
  icon,
  onPress,
}: RowProps) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.iconWell}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

function pickCategory(category: PayeeCategory | null) {
  return category ? { id: category.id, name: category.name } : null;
}

function brandSelection(brand: BrandSuggestion): CounterpartySelection {
  return {
    name: brand.name,
    brandId: brand.id,
    counterpartyType: "merchant",
    category: pickCategory(brand.category),
  };
}

function payeeSelection(payee: PayeeSuggestion): CounterpartySelection {
  return {
    name: payee.name,
    brandId: payee.brand_id,
    counterpartyType: payee.counterparty_type,
    category: pickCategory(payee.category),
  };
}

/**
 * The counterparty box of the transaction forms: a text input that suggests the user's own payees (best first) and
 * catalogue brands while they type, and always lets them keep exactly what they typed.
 */
export const CounterpartySearchField = memo(function CounterpartySearchField({
  txType,
  value,
  onChangeText,
  onSelect,
  brandId = null,
  placeholder,
  compact = false,
  editable = true,
}: CounterpartySearchFieldProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<View>(null);

  const typed = value.trim();
  const chipLimit = compact ? COMPACT_CHIP_LIMIT : CHIP_LIMIT;
  const yoursQuery = usePayeeSuggestions(txType, value, chipLimit);
  const brandQuery = useBrandSearch(value);

  useEffect(
    () => () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
      }
    },
    [],
  );

  // Opens upward when the keyboard leaves too little room below the input.
  useEffect(() => {
    if (!open) {
      return;
    }
    const measure = () =>
      rootRef.current?.measureInWindow((_x, y, _w, height) => {
        const visibleBottom =
          Keyboard.metrics()?.screenY ?? Dimensions.get("window").height;
        const below = visibleBottom - (y + height);
        setDropUp(below < DROPDOWN_MAX_HEIGHT && y > below);
      });
    measure();
    const shown = Keyboard.addListener("keyboardDidShow", measure);
    const hidden = Keyboard.addListener("keyboardDidHide", measure);
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [open]);

  const merged = useMemo(
    () =>
      mergeCounterpartyResults(
        yoursQuery.data ?? [],
        brandQuery.data ?? [],
        typed,
        compact ? COMPACT_CAPS : undefined,
      ),
    [brandQuery.data, compact, typed, yoursQuery.data],
  );

  const showChips =
    open && typed.length === 0 && (yoursQuery.data?.length ?? 0) > 0;
  const showResults =
    open &&
    typed.length > 0 &&
    (merged.yours.length > 0 ||
      merged.brands.length > 0 ||
      merged.showUseTyped);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const handleFocus = () => {
    cancelClose();
    setFocused(true);
    setOpen(brandId === null);
  };

  // A short delay, so a tap on a result still lands before the list goes away.
  const handleBlur = () => {
    setFocused(false);
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), BLUR_CLOSE_MS);
  };

  const handleChange = (text: string) => {
    setOpen(true);
    onChangeText(text);
  };

  const collapse = () => {
    cancelClose();
    setOpen(false);
    Keyboard.dismiss();
  };

  const choose = (selection: CounterpartySelection) => {
    collapse();
    onSelect(selection);
  };

  const iconFor = (
    category: PayeeCategory | null,
    type: PayeeSuggestion["counterparty_type"] | null,
  ) => {
    if (type === "person") {
      return <User size={16} color={colors.inkSoft} strokeWidth={1.5} />;
    }
    if (category) {
      return (
        <CategoryLucideIcon
          iconName={category.icon_name ?? "Tag"}
          color={category.color ?? colors.inkSoft}
          size={16}
        />
      );
    }
    return <Store size={16} color={colors.inkSoft} strokeWidth={1.5} />;
  };

  const input = compact ? (
    <TextField
      label="Paid to"
      hideLabel
      placeholder={placeholder}
      value={value}
      onChangeText={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      maxLength={200}
      autoCapitalize="sentences"
      returnKeyType="done"
      editable={editable}
    />
  ) : (
    <AppTextInput
      style={[styles.input, focused && styles.inputFocused]}
      placeholder={placeholder}
      placeholderTextColor={colors.inkFaint}
      value={value}
      onChangeText={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      maxLength={200}
      returnKeyType="next"
      editable={editable}
    />
  );

  return (
    <View ref={rootRef} style={styles.root}>
      {input}

      {/* Overlays the content below instead of pushing it down. */}
      {showChips || showResults ? (
        <View
          style={[
            styles.dropdown,
            dropUp ? styles.dropdownUp : styles.dropdownDown,
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.dropdownContent}
          >
            {showChips ? (
              <View style={styles.section}>
                <Text style={styles.caption}>YOUR PAYEES</Text>
                <View style={styles.chips}>
                  {(yoursQuery.data ?? []).slice(0, chipLimit).map((payee) => (
                    <Pressable
                      key={`${payee.brand_id ?? "own"}:${payee.name}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Pay ${payee.name}`}
                      hitSlop={4}
                      onPress={() => choose(payeeSelection(payee))}
                      style={({ pressed }) => [
                        styles.chip,
                        pressed && styles.rowPressed,
                      ]}
                    >
                      {iconFor(payee.category, payee.counterparty_type)}
                      <Text style={styles.chipLabel} numberOfLines={1}>
                        {payee.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {showResults ? (
              <View style={styles.results}>
                {merged.yours.length > 0 ? (
                  <View>
                    {compact ? null : <Text style={styles.caption}>YOURS</Text>}
                    {merged.yours.map((payee) => (
                      <ResultRow
                        key={`y:${payee.brand_id ?? "own"}:${payee.name}`}
                        label={
                          payee.category
                            ? `${payee.name}, ${payee.category.name}`
                            : payee.name
                        }
                        title={payee.name}
                        subtitle={payee.category?.name}
                        icon={iconFor(payee.category, payee.counterparty_type)}
                        onPress={() => choose(payeeSelection(payee))}
                      />
                    ))}
                  </View>
                ) : null}
                {merged.brands.length > 0 ? (
                  <View>
                    {compact ? null : (
                      <Text style={styles.caption}>BRANDS</Text>
                    )}
                    {merged.brands.map((brand) => (
                      <ResultRow
                        key={`b:${brand.id}`}
                        label={
                          brand.category
                            ? `${brand.name}, ${brand.category.name}`
                            : brand.name
                        }
                        title={brand.name}
                        subtitle={brand.category?.name}
                        icon={iconFor(brand.category, null)}
                        onPress={() => choose(brandSelection(brand))}
                      />
                    ))}
                    <Text style={styles.attribution}>{ATTRIBUTION}</Text>
                  </View>
                ) : null}
                {merged.showUseTyped ? (
                  <ResultRow
                    label={`Use “${merged.typedText}”`}
                    title={`Use “${merged.typedText}”`}
                    icon={
                      <Plus
                        size={16}
                        color={colors.accentText}
                        strokeWidth={1.5}
                      />
                    }
                    onPress={collapse}
                  />
                ) : null}
              </View>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  root: {
    zIndex: 10,
  },
  dropdown: {
    position: "absolute",
    left: 0,
    right: 0,
    maxHeight: DROPDOWN_MAX_HEIGHT,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    ...shadows.toast,
  },
  dropdownDown: {
    top: "100%",
    marginTop: spacing.xs,
  },
  dropdownUp: {
    bottom: "100%",
    marginBottom: spacing.xs,
  },
  dropdownContent: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: colors.ink,
    paddingHorizontal: 12,
    minHeight: 44,
    backgroundColor: colors.surface,
  },
  inputFocused: {
    borderColor: colors.accent,
    borderWidth: 1.5,
  },
  section: {
    gap: spacing.xs,
  },
  caption: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.inkSoft,
    marginTop: spacing.xs,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipLabel: {
    flexShrink: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  results: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
  },
  rowPressed: {
    backgroundColor: colors.surfaceSunken,
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  rowSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  attribution: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    lineHeight: 14,
    color: colors.inkFaint,
    paddingHorizontal: 4,
  },
}));
