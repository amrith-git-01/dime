import { Check, ChevronDown } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Dimensions,
    Keyboard,
    Modal,
    Platform,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fontFamilies } from "@/constants/fonts";
import { formStyles } from "@/constants/formStyles";
import { colors, spacing } from "@/constants/theme";

const MENU_GAP = 6;
const PANEL_MAX_FALLBACK = 280;
const BACKDROP_DIM = "rgba(15, 23, 42, 0.14)";
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
  const insets = useSafeAreaInsets();
  const triggerRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);
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
    setMenuRect(null);
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) {
      return;
    }
    Keyboard.dismiss();
    const runMeasure = () => {
      triggerRef.current?.measureInWindow((x, y, width, height) => {
        const winH = Dimensions.get("window").height;
        const top = y + height + MENU_GAP;
        const bottomMargin = Math.max(insets.bottom, spacing.lg) + spacing.sm;
        const available = winH - top - bottomMargin;
        const maxHeight = Math.min(
          PANEL_MAX_FALLBACK,
          Math.max(120, available),
        );
        setMenuRect({ left: x, top, width, maxHeight });
        setOpen(true);
      });
    };
    requestAnimationFrame(runMeasure);
  }, [disabled, insets.bottom]);

  const onTriggerPress = useCallback(() => {
    if (disabled) {
      return;
    }
    if (open) {
      closeMenu();
      return;
    }
    openMenu();
  }, [closeMenu, disabled, open, openMenu]);

  const onSelect = useCallback(
    (next: T) => {
      onChange(next);
      closeMenu();
    },
    [closeMenu, onChange],
  );

  const hasError = typeof errorMessage === "string" && errorMessage.length > 0;

  return (
    <View>
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
              variant === "primary" && !matched && styles.triggerPlaceholderPrimary,
              variant === "secondary" && !matched && styles.triggerPlaceholderSecondary,
            ]}
            numberOfLines={1}
          >
            {triggerText ?? selectedLabel}
          </Text>
          <Animated.View style={[styles.chevronWrap, chevronAnimatedStyle]}>
            <ChevronDown
              size={20}
              color={variant === "primary" ? colors.textOnPrimary : colors.inactive}
              strokeWidth={2}
            />
          </Animated.View>
        </Pressable>
      </View>
      {hasError ? (
        <Text style={formStyles.fieldError}>{errorMessage}</Text>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeMenu}
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss menu"
            style={styles.backdrop}
            onPress={closeMenu}
          />
          {menuRect ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.floatingPanel,
                {
                  left: menuRect.left,
                  top: menuRect.top,
                  width: menuRect.width,
                  maxHeight: menuRect.maxHeight,
                },
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
                          size={20}
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
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKDROP_DIM,
  },
  floatingPanel: {
    position: "absolute",
    backgroundColor: colors.barBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: {
        elevation: 16,
      },
      default: {},
    }),
  },
  labelPrimary: {
    color: colors.textOnPrimaryMuted,
  },
  panelScroll: {
    maxHeight: "100%",
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
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  triggerShellSecondary: {
    minWidth: 92,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  triggerShellOpen: {
    borderColor: colors.primary,
  },
  triggerShellError: {
    borderColor: "#BA1A1A",
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
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  triggerTextPrimary: {
    color: colors.textOnPrimary,
  },
  triggerTextSecondary: {
    color: colors.textOnPrimary,
    fontSize: 14,
    lineHeight: 20,
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
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  optionRowPrimary: {
    minHeight: 44,
  },
  optionRowSecondary: {
    minHeight: 40,
    paddingHorizontal: 12,
  },
  optionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  optionRowSelected: {
    backgroundColor: "rgba(99, 85, 232, 0.08)",
  },
  optionRowPressed: {
    opacity: 0.9,
  },
  optionLabel: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },
  optionLabelPrimary: {
    fontSize: 15,
    lineHeight: 20,
  },
  optionLabelSecondary: {
    fontSize: 14,
    lineHeight: 18,
  },
  optionLabelSelected: {
    fontFamily: fontFamilies.medium,
  },
});
