import { Check, ChevronDown } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { fontFamilies } from "@/constants/fonts";
import { formStyles } from "@/constants/formStyles";
import { colors, radius, spacing, surfaces } from "@/constants/theme";

const MENU_GAP = 6;
const PANEL_MAX_FALLBACK = 280;
const ARROW_ROTATION_MS = 220;

export type SelectDropdownOption<T extends string = string> = {
  value: T;
  label: string;
};

export type SelectDropdownProps<T extends string = string> = {
  label?: string;
  options: readonly SelectDropdownOption<T>[];
  value: T;
  onChange: (next: T) => void;
  placeholder?: string;
  disabled?: boolean;
  errorMessage?: string | null;
  variant?: "default" | "primary" | "secondary";
  showLabel?: boolean;
  triggerText?: string;
};

type MenuRect = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

export function SelectDropdown<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = "Select",
  disabled = false,
  errorMessage,
  variant = "default",
  showLabel = true,
  triggerText,
}: SelectDropdownProps<T>) {
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const arrowRotation = useSharedValue(0);

  useEffect(() => {
    arrowRotation.value = withTiming(open ? 180 : 0, {
      duration: ARROW_ROTATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [arrowRotation, open]);

  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrowRotation.value}deg` }],
  }));

  const matched = options.find((o) => o.value === value);
  const selectedLabel = matched?.label ?? placeholder;

  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  const onTriggerPress = useCallback(() => {
    if (disabled) {
      return;
    }
    Keyboard.dismiss();
    setOpen((current) => !current);
  }, [disabled]);

  const onSelect = useCallback(
    (next: T) => {
      onChange(next);
      closeMenu();
    },
    [closeMenu, onChange],
  );

  const hasError = typeof errorMessage === "string" && errorMessage.length > 0;

  return (
    <View style={[styles.root, open && styles.rootOpen]}>
      {showLabel ? (
        <Text
          style={[
            formStyles.fieldLabel,
            variant === "primary" && styles.labelPrimary,
          ]}
        >
          {label ?? ""}
        </Text>
      ) : null}
      <View
        ref={triggerRef}
        collapsable={false}
        style={[
          styles.triggerShell,
          variant === "primary" && styles.triggerShellPrimary,
          variant === "secondary" && styles.triggerShellSecondary,
          open && styles.triggerShellOpen,
          hasError && styles.triggerShellError,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled, expanded: open }}
          disabled={disabled}
          onPress={onTriggerPress}
          style={({ pressed }) => [
            styles.triggerRow,
            variant === "primary" && styles.triggerRowPrimary,
            variant === "secondary" && styles.triggerRowSecondary,
            pressed && !disabled && styles.triggerPressed,
            disabled && styles.triggerDisabled,
          ]}
        >
          <Text
            style={[
              styles.triggerText,
              variant === "primary" && styles.triggerTextPrimary,
              variant === "secondary" && styles.triggerTextSecondary,
              !matched && styles.triggerPlaceholder,
              variant === "primary" &&
                !matched &&
                styles.triggerPlaceholderPrimary,
              variant === "secondary" &&
                !matched &&
                styles.triggerPlaceholderSecondary,
            ]}
            numberOfLines={1}
          >
            {triggerText ?? selectedLabel}
          </Text>
          <Animated.View style={[styles.chevronWrap, chevronAnimatedStyle]}>
            <ChevronDown
              size={18}
              color={
                variant === "secondary"
                  ? colors.textOnPrimary
                  : variant === "primary"
                    ? colors.textOnPrimary
                    : colors.inactive
              }
              strokeWidth={2}
            />
          </Animated.View>
        </Pressable>
      </View>
      {hasError ? (
        <Text style={formStyles.fieldError}>{errorMessage}</Text>
      ) : null}

      {open ? (
        <View
          style={[
            styles.panel,
            variant === "primary" && styles.panelPrimary,
            variant === "secondary" && styles.panelSecondary,
          ]}
        >
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={options.length > 5}
            style={styles.panelScroll}
            contentContainerStyle={styles.panelScrollContent}
          >
            {options.map((item, index) => {
              const selected = item.value === value;
              const isLast = index === options.length - 1;
              return (
                <Pressable
                  key={item.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onSelect(item.value)}
                  style={({ pressed }) => [
                    styles.optionRow,
                    variant === "primary" && styles.optionRowPrimary,
                    variant === "secondary" && styles.optionRowSecondary,
                    !isLast && styles.optionRowBorder,
                    selected && styles.optionRowSelected,
                    pressed && styles.optionRowPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      variant === "primary" && styles.optionLabelPrimary,
                      variant === "secondary" && styles.optionLabelSecondary,
                      selected && styles.optionLabelSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {selected ? (
                    <Check
                      size={18}
                      color={colors.headerGradientStart}
                      strokeWidth={2}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
  },
  rootOpen: {
    zIndex: 20,
  },
  labelPrimary: {
    color: colors.textOnPrimaryMuted,
  },
  panel: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: MENU_GAP,
    backgroundColor: colors.barBackground,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: spacing.xs,
    zIndex: 20,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 10,
  },
  panelPrimary: {
    minWidth: 104,
  },
  panelSecondary: {
    minWidth: 120,
  },
  panelScroll: {
    maxHeight: 250,
  },
  panelScrollContent: {
    flexGrow: 1,
  },
  triggerShell: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.barBackground,
    overflow: "hidden",
  },
  triggerShellPrimary: {
    minWidth: 104,
    borderColor: surfaces.selectOnPrimaryBorder,
    backgroundColor: surfaces.selectOnPrimaryBg,
  },
  triggerShellSecondary: {
    minWidth: 120,
    borderColor: surfaces.selectOnPrimaryBorder,
    backgroundColor: surfaces.selectOnPrimaryBg,
  },
  triggerShellOpen: {
    borderColor: colors.primary,
  },
  triggerShellError: {
    borderColor: colors.error,
  },
  triggerRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  triggerRowPrimary: {
    minHeight: 40,
    paddingHorizontal: 12,
  },
  triggerRowSecondary: {
    minHeight: 36,
    paddingHorizontal: 10,
  },
  triggerPressed: {
    opacity: 0.92,
  },
  triggerDisabled: {
    opacity: 0.55,
  },
  triggerText: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  triggerTextPrimary: {
    color: colors.textOnPrimary,
    fontSize: 14,
    lineHeight: 18,
  },
  triggerTextSecondary: {
    color: colors.textOnPrimary,
    fontSize: 11,
    lineHeight: 14,
  },
  triggerPlaceholder: {
    color: colors.inactive,
  },
  triggerPlaceholderPrimary: {
    color: colors.textOnPrimaryMuted,
  },
  triggerPlaceholderSecondary: {
    color: colors.textOnPrimaryMuted,
  },
  chevronWrap: {
    justifyContent: "center",
    alignItems: "center",
  },
  optionRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  optionRowPrimary: {
    minHeight: 40,
  },
  optionRowSecondary: {
    minHeight: 32,
    paddingHorizontal: 10,
  },
  optionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  optionRowSelected: {
    backgroundColor: surfaces.selectHighlight,
  },
  optionRowPressed: {
    opacity: 0.9,
  },
  optionLabel: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },
  optionLabelPrimary: {
    fontSize: 14,
    lineHeight: 18,
  },
  optionLabelSecondary: {
    fontSize: 11,
    lineHeight: 14,
    marginRight: 4,
  },
  optionLabelSelected: {
    fontFamily: fontFamilies.medium,
  },
});
