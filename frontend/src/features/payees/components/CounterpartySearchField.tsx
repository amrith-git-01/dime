import { Plus, Store, User } from "lucide-react-native";
import type { ReactNode } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { KeyboardEvents } from "react-native-keyboard-controller";
import Animated, { FadeOut } from "react-native-reanimated";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { useOverlayHost } from "@/components/layout/OverlayHost";
import { useKeyboardRoom } from "@/components/layout/StackScreenShell";
import { AppTextInput, TextField } from "@/components/ui";
import { fontFamilies, radius, spacing, timings } from "@/constants";
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
  /** The home-screen widget card: a lighter input, 4 results and no section captions. */
  compact?: boolean;
  editable?: boolean;
};

const ATTRIBUTION = "Brand data © OpenStreetMap contributors, Wikidata";
const BLUR_CLOSE_MS = 150;
const DROPDOWN_MAX_HEIGHT = 300;
/** Share of the window the dropdown may take, so the input still fits above it on short screens. */
const DROPDOWN_WINDOW_SHARE = 0.25;
const PAYEE_LIMIT = 8;
const COMPACT_PAYEE_LIMIT = 4;
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
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const dropdownMaxHeight = Math.min(
    DROPDOWN_MAX_HEIGHT,
    Math.round(windowHeight * DROPDOWN_WINDOW_SHARE),
  );
  const setKeyboardRoom = useKeyboardRoom();
  const overlayHost = useOverlayHost();
  const rootRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const typed = value.trim();
  const yoursQuery = usePayeeSuggestions(
    txType,
    value,
    compact ? COMPACT_PAYEE_LIMIT : PAYEE_LIMIT,
  );
  const brandQuery = useBrandSearch(value);

  useEffect(
    () => () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
      }
    },
    [],
  );

  // Android back starts hiding the keyboard while the input stays focused (it blurs only once the keyboard is gone),
  // so close on "will hide": the dropdown fades out together with the keyboard instead of lingering after it.
  useEffect(() => {
    if (!open) {
      return;
    }
    const subscription = KeyboardEvents.addListener("keyboardWillHide", () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setOpen(false);
    });
    return () => subscription.remove();
  }, [open]);

  // While focused, the screen keeps room for the dropdown between the input and the keyboard.
  useEffect(() => {
    setKeyboardRoom(focused ? dropdownMaxHeight + spacing.xs : 0);
  }, [dropdownMaxHeight, focused, setKeyboardRoom]);

  useEffect(() => () => setKeyboardRoom(0), [setKeyboardRoom]);

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

  const showResults =
    open &&
    typed.length > 0 &&
    (merged.yours.length > 0 ||
      merged.brands.length > 0 ||
      merged.showUseTyped);

  // Where the dropdown goes in the overlay layer: just under the input.
  const measureAnchor = useCallback(() => {
    const layer = overlayHost?.layer.current;
    if (!layer) {
      return;
    }
    // In window coordinates: the layer is a sibling of the content, and measureLayout only works against an ancestor.
    layer.measureInWindow((layerX, layerY) =>
      rootRef.current?.measureInWindow((x, y, width, height) =>
        setAnchor({
          left: x - layerX,
          top: y - layerY + height + spacing.xs,
          width,
        }),
      ),
    );
  }, [overlayHost]);

  useEffect(() => {
    if (showResults) {
      measureAnchor();
    }
  }, [measureAnchor, showResults]);

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

  // Overlays the content below instead of pushing it down: in the screen's overlay layer when there is one, so it
  // scrolls and takes touches on Android (see OverlayHost), else hanging from the input.
  const dropdownPosition = overlayHost
    ? {
        top: anchor?.top ?? 0,
        left: anchor?.left ?? 0,
        width: anchor?.width ?? 0,
        maxHeight: Math.min(
          dropdownMaxHeight,
          overlayHost.layerHeight() - (anchor?.top ?? 0) - spacing.xs,
        ),
      }
    : styles.dropdownInline;
  const dropdown =
    showResults && (anchor || !overlayHost) ? (
      <Animated.View
        style={[styles.dropdown, dropdownPosition]}
        exiting={FadeOut.duration(timings.normal.duration)}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.dropdownContent}
        >
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
                {compact ? null : <Text style={styles.caption}>BRANDS</Text>}
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
                  <Plus size={16} color={colors.accentText} strokeWidth={1.5} />
                }
                onPress={collapse}
              />
            ) : null}
          </View>
        </ScrollView>
      </Animated.View>
    ) : null;

  // Every render: the rows' handlers close over the latest props.
  useEffect(() => {
    overlayHost?.setOverlay(dropdown);
  });

  useEffect(() => () => overlayHost?.setOverlay(null), [overlayHost]);

  return (
    <View ref={rootRef} style={styles.root} onLayout={measureAnchor}>
      {input}

      {overlayHost ? null : dropdown}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  root: {
    zIndex: 10,
  },
  dropdown: {
    position: "absolute",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    ...shadows.toast,
  },
  dropdownInline: {
    top: "100%",
    left: 0,
    right: 0,
    marginTop: spacing.xs,
    maxHeight: DROPDOWN_MAX_HEIGHT,
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
  caption: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.inkSoft,
    marginTop: spacing.xs,
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
