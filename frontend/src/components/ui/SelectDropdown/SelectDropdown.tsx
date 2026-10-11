import { ChevronDown } from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  InteractionManager,
  Keyboard,
  Pressable,
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

import { colors, radius, spacing, surfaces } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { formStyles } from "@/constants/formStyles";

import { SelectDropdownMenu } from "./SelectDropdownMenu";
import {
  COMPACT_TRIGGER_HEIGHT,
  resolveMenuRect,
  resolveMenuRectBelowAnchor,
  resolvePanelScrollHeight,
  type MenuRect,
  type SelectDropdownSize,
  type SelectDropdownVariant,
} from "./selectDropdownLayout";

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
  variant?: SelectDropdownVariant;
  showLabel?: boolean;
  triggerText?: string;
  onOpenChange?: (open: boolean) => void;
  /**
   * `modal` — menu portals in a full-screen overlay (default; supports scroll).
   * `inline` — same overlay; trigger is measured so the menu opens below it (bento headers).
   */
  menuPlacement?: "inline" | "modal";
  /** When "below", always open under the trigger (never flip above). */
  menuOpenDirection?: "auto" | "below";
  size?: SelectDropdownSize;
  /** Cap visible rows; additional options scroll inside the panel. */
  maxVisibleOptions?: number;
  /**
   * Optional anchor for modal-mode Y positioning.
   * When provided the panel appears below THIS view's bottom edge (e.g. an outer card),
   * while X-position and width are still derived from the trigger button.
   */
  panelAnchorRef?: RefObject<View | null>;
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
  onOpenChange,
  menuOpenDirection = "auto",
  size = "default",
  maxVisibleOptions,
  panelAnchorRef,
}: SelectDropdownProps<T>) {
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

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrowRotation.value}deg` }],
  }));

  const matched = options.find((o) => o.value === value);
  const selectedLabel = matched?.label ?? placeholder;

  const closeMenu = useCallback(() => {
    setOpen(false);
    setMenuRect(null);
  }, []);

  const panelScrollHeight = resolvePanelScrollHeight(
    size,
    options.length,
    maxVisibleOptions,
  );

  /**
   * Measures the trigger (and optional anchor) then calls `onMeasured` with the
   * resolved MenuRect.  When `panelAnchorRef` is provided the panel's Y position
   * is derived from the anchor's bottom edge; X-position + width come from the
   * trigger regardless.
   */
  const measureMenuPosition = useCallback(
    (onMeasured: (rect: MenuRect) => void) => {
      if (panelAnchorRef?.current) {
        panelAnchorRef.current.measureInWindow((left, top, width, height) => {
          if (width <= 0 || height <= 0) return;
          const anchorBottom = top + height;
          onMeasured(
            resolveMenuRectBelowAnchor(
              anchorBottom,
              left,
              width,
              options.length,
              size,
              maxVisibleOptions,
            ),
          );
        });
        return;
      }
      triggerRef.current?.measureInWindow((left, top, width, height) => {
        if (width <= 0 || height <= 0) return;
        onMeasured(
          resolveMenuRect(
            left,
            top,
            width,
            height,
            options.length,
            size,
            maxVisibleOptions,
            menuOpenDirection,
          ),
        );
      });
    },
    [
      maxVisibleOptions,
      menuOpenDirection,
      options.length,
      panelAnchorRef,
      size,
    ],
  );

  const openMenu = useCallback(() => {
    InteractionManager.runAfterInteractions(() => {
      measureMenuPosition((rect) => {
        setMenuRect(rect);
        setOpen(true);
      });
    });
  }, [measureMenuPosition]);

  const onTriggerPress = useCallback(() => {
    if (disabled) {
      return;
    }
    Keyboard.dismiss();
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
          size === "compact" && styles.triggerShellCompact,
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
            size === "compact" && styles.triggerRowCompact,
            variant === "primary" && styles.triggerRowPrimary,
            variant === "secondary" && styles.triggerRowSecondary,
            pressed && !disabled && styles.triggerPressed,
            disabled && styles.triggerDisabled,
          ]}
        >
          <Text
            style={[
              styles.triggerText,
              size === "compact" && styles.triggerTextCompact,
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
              size={size === "compact" ? 14 : 18}
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

      <SelectDropdownMenu
        open={open}
        menuRect={menuRect}
        options={options}
        value={value}
        size={size}
        variant={variant}
        maxVisibleOptions={maxVisibleOptions}
        panelScrollHeight={panelScrollHeight}
        onSelect={onSelect}
        onClose={closeMenu}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
    alignSelf: "stretch",
  },
  rootOpen: {
    zIndex: 9999,
    elevation: 24,
  },
  labelPrimary: {
    color: colors.textOnPrimaryMuted,
  },
  triggerShell: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.barBackground,
    overflow: "hidden",
  },
  triggerShellCompact: {
    minWidth: 120,
    borderWidth: 1,
    borderRadius: radius.xs,
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
  triggerRowCompact: {
    minHeight: COMPACT_TRIGGER_HEIGHT,
    paddingHorizontal: 8,
    paddingVertical: 2,
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
  triggerTextCompact: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textPrimary,
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
    marginLeft: 2,
  },
});
