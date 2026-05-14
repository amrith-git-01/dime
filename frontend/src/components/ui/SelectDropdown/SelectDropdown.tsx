import { Check, ChevronDown } from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Dimensions,
  Keyboard,
  Modal,
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
import { colors, radius, spacing, surfaces } from "@/constants";

const MENU_GAP = 6;
const MENU_GAP_COMPACT = 4;
const PANEL_MAX_HEIGHT = 280;
const ARROW_ROTATION_MS = 220;
const COMPACT_TRIGGER_HEIGHT = 28;
const DEFAULT_TRIGGER_HEIGHT = 52;
const COMPACT_OPTION_ROW_HEIGHT = 32;

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
  onOpenChange?: (open: boolean) => void;
  /** Inline = menu anchors below trigger (fixed headers). Modal = portal overlay (forms, lists). */
  menuPlacement?: "inline" | "modal";
  size?: "default" | "compact";
  /** Cap visible rows; additional options scroll inside the panel. */
  maxVisibleOptions?: number;
  /**
   * Optional anchor for modal-mode Y positioning.
   * When provided the panel appears below THIS view's bottom edge (e.g. an outer card),
   * while X-position and width are still derived from the trigger button.
   */
  panelAnchorRef?: RefObject<View>;
};

type MenuRect = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

function optionRowHeight(size: "default" | "compact"): number {
  return size === "compact" ? COMPACT_OPTION_ROW_HEIGHT : 46;
}

function resolvePanelScrollHeight(
  size: "default" | "compact",
  optionCount: number,
  maxVisibleOptions?: number,
): number {
  const rowHeight = optionRowHeight(size);
  const visibleRows = maxVisibleOptions
    ? Math.min(optionCount, maxVisibleOptions)
    : optionCount;
  const contentHeight = visibleRows * rowHeight + spacing.xs * 2;
  return Math.min(contentHeight, PANEL_MAX_HEIGHT);
}

function triggerHeightFallback(size: "default" | "compact"): number {
  return size === "compact" ? COMPACT_TRIGGER_HEIGHT : DEFAULT_TRIGGER_HEIGHT;
}

function resolveMenuRect(
  triggerLeft: number,
  triggerTop: number,
  triggerWidth: number,
  triggerHeight: number,
  optionCount: number,
  size: "default" | "compact",
  maxVisibleOptions?: number,
): MenuRect {
  const windowHeight = Dimensions.get("window").height;
  const preferredHeight = resolvePanelScrollHeight(
    size,
    optionCount,
    maxVisibleOptions,
  );
  const measuredHeight = Math.max(triggerHeight, triggerHeightFallback(size));
  const belowTop = triggerTop + measuredHeight + MENU_GAP;
  const spaceBelow = windowHeight - belowTop - spacing.lg;
  const spaceAbove = triggerTop - MENU_GAP - spacing.lg;
  const minDropHeight = optionRowHeight(size) + spacing.xs * 2;

  // Prefer opening below the trigger; only flip up when there is no room below.
  if (spaceBelow >= minDropHeight) {
    return {
      left: triggerLeft,
      top: belowTop,
      width: triggerWidth,
      maxHeight: Math.max(Math.min(preferredHeight, spaceBelow), minDropHeight),
    };
  }

  const maxHeight = Math.max(
    Math.min(preferredHeight, Math.max(spaceAbove, minDropHeight)),
    minDropHeight,
  );
  return {
    left: triggerLeft,
    top: Math.max(spacing.lg, triggerTop - MENU_GAP - maxHeight),
    width: triggerWidth,
    maxHeight,
  };
}

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
  menuPlacement = "modal",
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

  const showScrollIndicator = maxVisibleOptions
    ? options.length > maxVisibleOptions
    : options.length > 5;

  const scrollViewportHeight =
    menuRect != null
      ? Math.min(menuRect.maxHeight, panelScrollHeight)
      : panelScrollHeight;

  /**
   * Measures the trigger (and optional anchor) then calls `onMeasured` with the
   * resolved MenuRect.  When `panelAnchorRef` is provided the panel's Y position
   * is derived from the anchor's bottom edge; X-position + width come from the
   * trigger regardless.
   */
  const measureMenuPosition = useCallback(
    (onMeasured: (rect: MenuRect) => void) => {
      if (panelAnchorRef?.current) {
        // Two-phase: anchor → Y extent, trigger → X + width
        panelAnchorRef.current.measureInWindow(
          (anchorLeft, anchorTop, anchorW, anchorH) => {
            if (anchorW <= 0 || anchorH <= 0) return;
            const anchorBottom = anchorTop + anchorH;
            triggerRef.current?.measureInWindow((left, _top, width, height) => {
              if (width <= 0 || height <= 0) return;
              const mh = Math.max(height, triggerHeightFallback(size));
              // Synthesise triggerTop so resolveMenuRect produces belowTop = anchorBottom
              const syntheticTop = anchorBottom - mh - MENU_GAP;
              onMeasured(
                resolveMenuRect(
                  left,
                  syntheticTop,
                  width,
                  height,
                  options.length,
                  size,
                  maxVisibleOptions,
                ),
              );
            });
          },
        );
        return;
      }
      // Default: single measurement from trigger
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
          ),
        );
      });
    },
    [maxVisibleOptions, options.length, panelAnchorRef, size],
  );

  const openMenu = useCallback(() => {
    measureMenuPosition((rect) => {
      setMenuRect(rect);
      setOpen(true);
    });
  }, [measureMenuPosition]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const measure = () => measureMenuPosition(setMenuRect);
    measure();
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [measureMenuPosition, open]);

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

  const panelVariantStyle =
    variant === "primary"
      ? styles.panelPrimary
      : variant === "secondary"
        ? styles.panelSecondary
        : null;

  const renderOptions = () =>
    options.map((item, index) => {
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
            size === "compact" && styles.optionRowCompact,
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
              size === "compact" && styles.optionLabelCompact,
              variant === "primary" && styles.optionLabelPrimary,
              variant === "secondary" && styles.optionLabelSecondary,
              selected && styles.optionLabelSelected,
            ]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
          {selected ? (
            <Check
              size={size === "compact" ? 14 : 18}
              color={colors.headerGradientStart}
              strokeWidth={2}
            />
          ) : null}
        </Pressable>
      );
    });

  const optionsPanel = (
    <ScrollView
      bounces={false}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      scrollEnabled
      showsVerticalScrollIndicator={showScrollIndicator}
      style={[
        styles.panelScroll,
        maxVisibleOptions
          ? {
              height: scrollViewportHeight,
              maxHeight: scrollViewportHeight,
            }
          : { maxHeight: scrollViewportHeight },
      ]}
      contentContainerStyle={styles.panelScrollContent}
    >
      {renderOptions()}
    </ScrollView>
  );

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

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
        statusBarTranslucent
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            style={styles.backdrop}
            onPress={closeMenu}
          />
          {menuRect ? (
            <View
              style={[
                styles.panel,
                styles.panelOverlay,
                panelVariantStyle,
                size === "compact" && styles.panelCompact,
                {
                  top: menuRect.top,
                  left: menuRect.left,
                  width: menuRect.width,
                  maxHeight: menuRect.maxHeight,
                },
              ]}
            >
              {optionsPanel}
            </View>
          ) : null}
        </View>
      </Modal>
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
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  labelPrimary: {
    color: colors.textOnPrimaryMuted,
  },
  panel: {
    backgroundColor: colors.barBackground,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: spacing.xs,
    overflow: "hidden",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 24,
  },
  panelOverlay: {
    position: "absolute",
    zIndex: 10000,
    elevation: 24,
  },
  panelInline: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: MENU_GAP,
    zIndex: 10000,
    elevation: 24,
  },
  panelInlineCompact: {
    marginTop: MENU_GAP_COMPACT,
  },
  panelCompact: {
    minWidth: 120,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  panelPrimary: {
    minWidth: 104,
  },
  panelSecondary: {
    minWidth: 120,
  },
  panelScroll: {
    maxHeight: PANEL_MAX_HEIGHT,
  },
  panelScrollContent: {
    flexGrow: 0,
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
  optionRowCompact: {
    minHeight: COMPACT_OPTION_ROW_HEIGHT,
    paddingHorizontal: 8,
    paddingVertical: 2,
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
  optionLabelCompact: {
    fontSize: 12,
    lineHeight: 16,
    marginRight: spacing.xs,
  },
  optionLabelSelected: {
    fontFamily: fontFamilies.medium,
  },
});
